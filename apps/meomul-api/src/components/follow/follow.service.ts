import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FollowInput, FollowInquiry } from '../../libs/dto/follow/follow.input';
import { FollowDto, Followers, Followings, MemberBasicDto } from '../../libs/dto/follow/follow';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { FollowDocument } from '../../libs/types/follow';
import { toFollowDto } from '../../libs/types/follow';
import { MemberService } from '../member/member.service';
import { LikeService } from '../like/like.service';
import { LikeGroup } from '../../libs/enums/common.enum';

export interface ToggleFollowResult {
	following: boolean;
	followerCount: number;
	follow?: FollowDto;
}

@Injectable()
export class FollowService {
	private readonly logger = new Logger(FollowService.name);

	constructor(
		@InjectModel('Follow') private readonly followModel: Model<FollowDocument>,
		private readonly memberService: MemberService,
		private readonly likeService: LikeService,
	) {}

	/**
	 * Toggle follow (follow if not following, unfollow if already following)
	 * HYBRID + TRANSACTION: Updates both follow collection AND denormalized counts atomically
	 */
	public async toggleFollow(currentMember: MemberJwtPayload, input: FollowInput): Promise<ToggleFollowResult> {
		// Prevent self-follow
		if (currentMember._id === input.followingId) {
			throw new BadRequestException(Messages.CANNOT_FOLLOW_YOURSELF);
		}

		// Start MongoDB session for transaction
		const session = await this.followModel.db.startSession();
		session.startTransaction();

		try {
			// Check if already following
			const existingFollow = await this.followModel
				.findOne({
					followerId: currentMember._id,
					followingId: input.followingId,
				})
				.session(session)
				.exec();

			if (existingFollow) {
				// Unfollow - remove the follow and decrement counts
				await this.followModel.deleteOne({ _id: existingFollow._id }).session(session).exec();

				// Update denormalized counts on Member documents
				await Promise.all([
					this.memberService.memberStatsEditor(currentMember._id, 'memberFollowings', -1, session),
					this.memberService.memberStatsEditor(input.followingId, 'memberFollowers', -1, session),
				]);

				// Commit transaction
				await session.commitTransaction();

				// Get updated count (after commit)
				const followerCount = await this.getFollowerCount(input.followingId);

				return {
					following: false,
					followerCount,
				};
			} else {
				// Follow - create new follow and increment counts
				const [follow] = await this.followModel.create(
					[
						{
							followerId: currentMember._id,
							followingId: input.followingId,
						},
					],
					{ session },
				);

				// Update denormalized counts on Member documents
				await Promise.all([
					this.memberService.memberStatsEditor(currentMember._id, 'memberFollowings', 1, session),
					this.memberService.memberStatsEditor(input.followingId, 'memberFollowers', 1, session),
				]);

				// Commit transaction
				await session.commitTransaction();

				// Get updated count (after commit)
				const followerCount = await this.getFollowerCount(input.followingId);

				return {
					following: true,
					followerCount,
					follow: toFollowDto(follow),
				};
			}
		} catch (error) {
			// Rollback on any error
			await session.abortTransaction();
			this.logger.error('Transaction failed in toggleFollow:', error);
			throw error;
		} finally {
			// Always end session
			session.endSession();
		}
	}

	/**
	 * Get follower count for a member
	 */
	public async getFollowerCount(memberId: string): Promise<number> {
		return this.followModel
			.countDocuments({
				followingId: memberId,
			})
			.exec();
	}

	/**
	 * Get following count for a member
	 */
	public async getFollowingCount(memberId: string): Promise<number> {
		return this.followModel
			.countDocuments({
				followerId: memberId,
			})
			.exec();
	}

	/**
	 * Check if follower is following target member
	 */
	public async isFollowing(followerId: string, followingId: string): Promise<boolean> {
		const follow = await this.followModel
			.findOne({
				followerId,
				followingId,
			})
			.exec();

		return !!follow;
	}

	/**
	 * Get all followers of a member
	 */
	public async getFollowers(memberId: string): Promise<FollowDto[]> {
		const follows = await this.followModel
			.find({
				followingId: memberId,
			})
			.sort({ createdAt: -1 })
			.exec();

		return follows.map(toFollowDto);
	}

	/**
	 * Get all members that a member is following
	 */
	public async getFollowing(memberId: string): Promise<FollowDto[]> {
		const follows = await this.followModel
			.find({
				followerId: memberId,
			})
			.sort({ createdAt: -1 })
			.exec();

		return follows.map(toFollowDto);
	}

	/**
	 * Get paginated followers of a member
	 * ENHANCED: With populate + lookup helpers (meFollowed, meLiked)
	 */
	public async getMemberFollowersPaginated(
		memberId: string,
		input: FollowInquiry,
		currentMember?: MemberJwtPayload,
	): Promise<Followers> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const pipeline: any[] = [
			{ $match: { followingId: new Types.ObjectId(memberId) } },
			{ $sort: { createdAt: -1 } },
			{ $skip: skip },
			{ $limit: limit },

			// Populate follower data
			{
				$lookup: {
					from: 'members',
					localField: 'followerId',
					foreignField: '_id',
					as: 'followerData',
				},
			},
			{
				$unwind: { path: '$followerData', preserveNullAndEmptyArrays: true },
			},
		];

		// Add meFollowed lookup if currentMember exists
		if (currentMember) {
			pipeline.push(
				{
					$lookup: {
						from: 'follows',
						let: { followerId: '$followerId' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$followerId', new Types.ObjectId(currentMember._id)] },
											{ $eq: ['$followingId', '$$followerId'] },
										],
									},
								},
							},
						],
						as: 'meFollowedCheck',
					},
				},
				{
					$addFields: {
						meFollowed: { $gt: [{ $size: '$meFollowedCheck' }, 0] },
					},
				},
			);

			// Add meLiked lookup
			pipeline.push(
				{
					$lookup: {
						from: 'likes',
						let: { followerId: '$followerId' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$memberId', new Types.ObjectId(currentMember._id)] },
											{ $eq: ['$likeRefId', '$$followerId'] },
											{ $eq: ['$likeGroup', 'MEMBER'] },
										],
									},
								},
							},
						],
						as: 'meLikedCheck',
					},
				},
				{
					$addFields: {
						meLiked: { $gt: [{ $size: '$meLikedCheck' }, 0] },
					},
				},
			);
		}

		const [list, total] = await Promise.all([
			this.followModel.aggregate(pipeline).exec(),
			this.followModel.countDocuments({ followingId: memberId }).exec(),
		]);

		return {
			list,
			metaCounter: { total },
		};
	}

	/**
	 * Get paginated list of members that a member is following
	 * ENHANCED: With populate + lookup helpers (meFollowed, meLiked)
	 */
	public async getMemberFollowingsPaginated(
		memberId: string,
		input: FollowInquiry,
		currentMember?: MemberJwtPayload,
	): Promise<Followings> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const pipeline: any[] = [
			{ $match: { followerId: new Types.ObjectId(memberId) } },
			{ $sort: { createdAt: -1 } },
			{ $skip: skip },
			{ $limit: limit },

			// Populate following data
			{
				$lookup: {
					from: 'members',
					localField: 'followingId',
					foreignField: '_id',
					as: 'followingData',
				},
			},
			{
				$unwind: { path: '$followingData', preserveNullAndEmptyArrays: true },
			},
		];

		// Add meFollowed lookup if currentMember exists
		if (currentMember) {
			pipeline.push(
				{
					$lookup: {
						from: 'follows',
						let: { followingId: '$followingId' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$followerId', new Types.ObjectId(currentMember._id)] },
											{ $eq: ['$followingId', '$$followingId'] },
										],
									},
								},
							},
						],
						as: 'meFollowedCheck',
					},
				},
				{
					$addFields: {
						meFollowed: { $gt: [{ $size: '$meFollowedCheck' }, 0] },
					},
				},
			);

			// Add meLiked lookup
			pipeline.push(
				{
					$lookup: {
						from: 'likes',
						let: { followingId: '$followingId' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$memberId', new Types.ObjectId(currentMember._id)] },
											{ $eq: ['$likeRefId', '$$followingId'] },
											{ $eq: ['$likeGroup', 'MEMBER'] },
										],
									},
								},
							},
						],
						as: 'meLikedCheck',
					},
				},
				{
					$addFields: {
						meLiked: { $gt: [{ $size: '$meLikedCheck' }, 0] },
					},
				},
			);
		}

		const [list, total] = await Promise.all([
			this.followModel.aggregate(pipeline).exec(),
			this.followModel.countDocuments({ followerId: memberId }).exec(),
		]);

		return {
			list,
			metaCounter: { total },
		};
	}

	/**
	 * Remove all follow relationships for a member (cleanup when member is deleted)
	 */
	public async removeFollowsForMember(memberId: string): Promise<void> {
		await this.followModel
			.deleteMany({
				$or: [{ followerId: memberId }, { followingId: memberId }],
			})
			.exec();
	}
}
