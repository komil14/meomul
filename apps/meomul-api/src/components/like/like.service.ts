import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import type { Model } from 'mongoose';
import { LikeInput } from '../../libs/dto/like/like.input';
import { LikeDto } from '../../libs/dto/like/like';
import { LikeGroup } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { LikeDocument } from '../../libs/types/like';
import { toLikeDto } from '../../libs/types/like';

export interface ToggleLikeResult {
	liked: boolean;
	likeCount: number;
	like?: LikeDto;
}

@Injectable()
export class LikeService {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel('Like') private readonly likeModel: Model<LikeDocument>,
	) {}

	/**
	 * Toggle like (like if not liked, unlike if already liked)
	 */
	public async toggleLike(currentMember: MemberJwtPayload, input: LikeInput): Promise<ToggleLikeResult> {
		// Check if already liked
		const existingLike = await this.likeModel
			.findOne({
				likeRefId: input.likeRefId,
				memberId: currentMember._id,
				likeGroup: input.likeGroup,
			})
			.exec();

		if (existingLike) {
			// Unlike - remove the like
			await this.likeModel.deleteOne({ _id: existingLike._id }).exec();

			// Get updated count
			const likeCount = await this.getLikeCount(input.likeRefId, input.likeGroup);

			// Invalidate recommendation cache for this user (fire-and-forget)
			if (input.likeGroup === LikeGroup.HOTEL) {
				this.invalidateRecCache(currentMember._id);
			}

			return {
				liked: false,
				likeCount,
			};
		} else {
			// Like - create new like
			const like = await this.likeModel.create({
				likeGroup: input.likeGroup,
				likeRefId: input.likeRefId,
				memberId: currentMember._id,
			});

			// Get updated count
			const likeCount = await this.getLikeCount(input.likeRefId, input.likeGroup);

			// Invalidate recommendation cache for this user (fire-and-forget)
			if (input.likeGroup === LikeGroup.HOTEL) {
				this.invalidateRecCache(currentMember._id);
			}

			return {
				liked: true,
				likeCount,
				like: toLikeDto(like),
			};
		}
	}

	/**
	 * Get like count for an item
	 */
	public async getLikeCount(likeRefId: string, likeGroup: LikeGroup): Promise<number> {
		return this.likeModel
			.countDocuments({
				likeRefId,
				likeGroup,
			})
			.exec();
	}

	/**
	 * Check if member has liked an item
	 */
	public async hasLiked(memberId: string, likeRefId: string, likeGroup: LikeGroup): Promise<boolean> {
		const like = await this.likeModel
			.findOne({
				likeRefId,
				memberId,
				likeGroup,
			})
			.exec();

		return !!like;
	}

	/**
	 * Get all likes by a member for a specific group
	 */
	public async getMemberLikes(memberId: string, likeGroup: LikeGroup): Promise<LikeDto[]> {
		const likes = await this.likeModel
			.find({
				memberId,
				likeGroup,
			})
			.sort({ createdAt: -1 })
			.exec();

		return likes.map(toLikeDto);
	}

	/**
	 * Remove all likes for a specific item (cleanup when item is deleted)
	 */
	private invalidateRecCache(memberId: string): void {
		Promise.all([
			this.cacheManager.del(`rec:${memberId}:10`),
			this.cacheManager.del(`rec:${memberId}:20`),
		]).catch(() => {});
	}

	public async removeLikesForItem(likeRefId: string, likeGroup: LikeGroup): Promise<void> {
		await this.likeModel
			.deleteMany({
				likeRefId,
				likeGroup,
			})
			.exec();
	}
}
