import { Args, Mutation, Query, Resolver, Int } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { FollowDto, Followers, Followings } from '../../libs/dto/follow/follow';
import { FollowInput, FollowInquiry } from '../../libs/dto/follow/follow.input';
import { ToggleFollowDto } from '../../libs/dto/follow/toggle-follow';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { FollowService } from './follow.service';

@Resolver()
export class FollowResolver {
	private readonly logger = new Logger(FollowResolver.name);

	constructor(private readonly followService: FollowService) {}

	/**
	 * Toggle follow (follow/unfollow)
	 */
	@Mutation(() => ToggleFollowDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async toggleFollow(
		@CurrentMember() currentMember: any,
		@Args('input') input: FollowInput,
	): Promise<ToggleFollowDto> {
		try {
			this.logger.log('Mutation toggleFollow', currentMember?._id ?? 'unknown', input.followingId);
			return this.followService.toggleFollow(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation toggleFollow failed', currentMember?._id ?? 'unknown', input.followingId, error);
			throw error;
		}
	}

	/**
	 * Get follower count for a member (public)
	 */
	@Query(() => Int)
	@Public()
	public async getFollowerCount(@Args('memberId') memberId: string): Promise<number> {
		try {
			this.logger.log('Query getFollowerCount', memberId);
			return this.followService.getFollowerCount(memberId);
		} catch (error) {
			this.logger.error('Query getFollowerCount failed', memberId, error);
			throw error;
		}
	}

	/**
	 * Get following count for a member (public)
	 */
	@Query(() => Int)
	@Public()
	public async getFollowingCount(@Args('memberId') memberId: string): Promise<number> {
		try {
			this.logger.log('Query getFollowingCount', memberId);
			return this.followService.getFollowingCount(memberId);
		} catch (error) {
			this.logger.error('Query getFollowingCount failed', memberId, error);
			throw error;
		}
	}

	/**
	 * Check if current user is following a member
	 */
	@Query(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async isFollowing(
		@CurrentMember() currentMember: any,
		@Args('followingId') followingId: string,
	): Promise<boolean> {
		try {
			this.logger.log('Query isFollowing', currentMember?._id ?? 'unknown', followingId);
			return this.followService.isFollowing(currentMember._id, followingId);
		} catch (error) {
			this.logger.error('Query isFollowing failed', currentMember?._id ?? 'unknown', followingId, error);
			throw error;
		}
	}

	/**
	 * Get followers of a member
	 */
	@Query(() => [FollowDto])
	@Public()
	public async getFollowers(@Args('memberId') memberId: string): Promise<FollowDto[]> {
		try {
			this.logger.log('Query getFollowers', memberId);
			return this.followService.getFollowers(memberId);
		} catch (error) {
			this.logger.error('Query getFollowers failed', memberId, error);
			throw error;
		}
	}

	/**
	 * Get members that current user is following
	 */
	@Query(() => [FollowDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyFollowing(@CurrentMember() currentMember: any): Promise<FollowDto[]> {
		try {
			this.logger.log('Query getMyFollowing', currentMember?._id ?? 'unknown');
			return this.followService.getFollowing(currentMember._id);
		} catch (error) {
			this.logger.error('Query getMyFollowing failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Get current user's followers
	 */
	@Query(() => [FollowDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyFollowers(@CurrentMember() currentMember: any): Promise<FollowDto[]> {
		try {
			this.logger.log('Query getMyFollowers', currentMember?._id ?? 'unknown');
			return this.followService.getFollowers(currentMember._id);
		} catch (error) {
			this.logger.error('Query getMyFollowers failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Get paginated followers of a member (ENHANCED - populate + lookup helpers)
	 */
	@Query(() => Followers)
	@Public()
	public async getMemberFollowersPaginated(
		@Args('memberId') memberId: string,
		@Args('input') input: FollowInquiry,
		@CurrentMember() currentMember?: any,
	): Promise<Followers> {
		try {
			this.logger.log('Query getMemberFollowersPaginated', memberId, input, currentMember?._id);
			return this.followService.getMemberFollowersPaginated(memberId, input, currentMember);
		} catch (error) {
			this.logger.error('Query getMemberFollowersPaginated failed', memberId, input, error);
			throw error;
		}
	}

	/**
	 * Get paginated followings of a member (ENHANCED - populate + lookup helpers)
	 */
	@Query(() => Followings)
	@Public()
	public async getMemberFollowingsPaginated(
		@Args('memberId') memberId: string,
		@Args('input') input: FollowInquiry,
		@CurrentMember() currentMember?: any,
	): Promise<Followings> {
		try {
			this.logger.log('Query getMemberFollowingsPaginated', memberId, input, currentMember?._id);
			return this.followService.getMemberFollowingsPaginated(memberId, input, currentMember);
		} catch (error) {
			this.logger.error('Query getMemberFollowingsPaginated failed', memberId, input, error);
			throw error;
		}
	}
}
