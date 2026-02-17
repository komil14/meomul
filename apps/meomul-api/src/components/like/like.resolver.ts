import { Args, Mutation, Query, Resolver, Int } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { LikeDto } from '../../libs/dto/like/like';
import { LikeInput } from '../../libs/dto/like/like.input';
import { ToggleLikeDto } from '../../libs/dto/like/toggle-like';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { LikeGroup } from '../../libs/enums/common.enum';
import { LikeService } from './like.service';

@Resolver()
export class LikeResolver {
	private readonly logger = new Logger(LikeResolver.name);

	constructor(private readonly likeService: LikeService) {}

	/**
	 * Toggle like (like/unlike)
	 */
	@Mutation(() => ToggleLikeDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async toggleLike(
		@CurrentMember() currentMember: any,
		@Args('input') input: LikeInput,
	): Promise<ToggleLikeDto> {
		try {
			this.logger.log('Mutation toggleLike', currentMember?._id ?? 'unknown', input.likeGroup, input.likeRefId);
			return this.likeService.toggleLike(currentMember, input);
		} catch (error) {
			this.logger.error(
				'Mutation toggleLike failed',
				currentMember?._id ?? 'unknown',
				input.likeGroup,
				input.likeRefId,
				error,
			);
			throw error;
		}
	}

	/**
	 * Get like count for an item (public)
	 */
	@Query(() => Int)
	@Public()
	public async getLikeCount(
		@Args('likeRefId') likeRefId: string,
		@Args('likeGroup', { type: () => LikeGroup }) likeGroup: LikeGroup,
	): Promise<number> {
		try {
			this.logger.log('Query getLikeCount', likeGroup, likeRefId);
			return this.likeService.getLikeCount(likeRefId, likeGroup);
		} catch (error) {
			this.logger.error('Query getLikeCount failed', likeGroup, likeRefId, error);
			throw error;
		}
	}

	/**
	 * Check if current user has liked an item
	 */
	@Query(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async hasLiked(
		@CurrentMember() currentMember: any,
		@Args('likeRefId') likeRefId: string,
		@Args('likeGroup', { type: () => LikeGroup }) likeGroup: LikeGroup,
	): Promise<boolean> {
		try {
			this.logger.log('Query hasLiked', currentMember?._id ?? 'unknown', likeGroup, likeRefId);
			return this.likeService.hasLiked(currentMember._id, likeRefId, likeGroup);
		} catch (error) {
			this.logger.error('Query hasLiked failed', currentMember?._id ?? 'unknown', likeGroup, likeRefId, error);
			throw error;
		}
	}

	/**
	 * Get member's likes for a specific group
	 */
	@Query(() => [LikeDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyLikes(
		@CurrentMember() currentMember: any,
		@Args('likeGroup', { type: () => LikeGroup }) likeGroup: LikeGroup,
	): Promise<LikeDto[]> {
		try {
			this.logger.log('Query getMyLikes', currentMember?._id ?? 'unknown', likeGroup);
			return this.likeService.getMemberLikes(currentMember._id, likeGroup);
		} catch (error) {
			this.logger.error('Query getMyLikes failed', currentMember?._id ?? 'unknown', likeGroup, error);
			throw error;
		}
	}
}
