import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ReviewDto } from '../../libs/dto/review/review';
import { ReviewInput } from '../../libs/dto/review/review.input';
import { ReviewUpdate } from '../../libs/dto/review/review.update';
import { ReviewsDto } from '../../libs/dto/common/reviews';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { ReviewStatus } from '../../libs/enums/common.enum';
import { ReviewService } from './review.service';

@Resolver()
export class ReviewResolver {
	constructor(private readonly reviewService: ReviewService) {}

	/**
	 * Get all reviews (ADMIN only) — includes FLAGGED, REMOVED
	 */
	@Query(() => ReviewsDto)
	@Roles(MemberType.ADMIN)
	public async getAllReviewsAdmin(
		@Args('input') input: PaginationInput,
		@Args('statusFilter', { type: () => ReviewStatus, nullable: true }) statusFilter?: ReviewStatus,
	): Promise<ReviewsDto> {
		try {
			console.log('Query getAllReviewsAdmin', statusFilter ?? 'all');
			return this.reviewService.getAllReviewsAdmin(input, statusFilter);
		} catch (error) {
			console.error('Query getAllReviewsAdmin failed', error);
			throw error;
		}
	}

	/**
	 * Create a review for a completed booking
	 */
	@Mutation(() => ReviewDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async createReview(
		@CurrentMember() currentMember: any,
		@Args('input') input: ReviewInput,
	): Promise<ReviewDto> {
		try {
			console.log('Mutation createReview', currentMember?._id ?? 'unknown', input.bookingId);
			return this.reviewService.createReview(currentMember, input);
		} catch (error) {
			console.error('Mutation createReview failed', currentMember?._id ?? 'unknown', input.bookingId, error);
			throw error;
		}
	}

	/**
	 * Update review
	 */
	@Mutation(() => ReviewDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async updateReview(
		@CurrentMember() currentMember: any,
		@Args('input') input: ReviewUpdate,
	): Promise<ReviewDto> {
		try {
			console.log('Mutation updateReview', currentMember?._id ?? 'unknown', input._id);
			return this.reviewService.updateReview(currentMember, input);
		} catch (error) {
			console.error('Mutation updateReview failed', currentMember?._id ?? 'unknown', input._id, error);
			throw error;
		}
	}

	/**
	 * Delete review (soft delete)
	 */
	@Mutation(() => ReviewDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async deleteReview(
		@CurrentMember() currentMember: any,
		@Args('reviewId') reviewId: string,
	): Promise<ReviewDto> {
		try {
			console.log('Mutation deleteReview', currentMember?._id ?? 'unknown', reviewId);
			return this.reviewService.deleteReview(currentMember, reviewId);
		} catch (error) {
			console.error('Mutation deleteReview failed', currentMember?._id ?? 'unknown', reviewId, error);
			throw error;
		}
	}

	/**
	 * Get single review (public)
	 * Auto-tracks view if user is authenticated
	 */
	@Query(() => ReviewDto)
	@Public()
	public async getReview(
		@Args('reviewId') reviewId: string,
		@CurrentMember() currentMember?: any,
	): Promise<ReviewDto> {
		try {
			console.log('Query getReview', reviewId, currentMember?._id ?? 'anonymous');
			return this.reviewService.getReview(reviewId, currentMember);
		} catch (error) {
			console.error('Query getReview failed', reviewId, error);
			throw error;
		}
	}

	/**
	 * Get hotel reviews (public)
	 */
	@Query(() => ReviewsDto)
	@Public()
	public async getHotelReviews(
		@Args('hotelId') hotelId: string,
		@Args('input') input: PaginationInput,
	): Promise<ReviewsDto> {
		try {
			console.log('Query getHotelReviews', hotelId, input.page);
			return this.reviewService.getHotelReviews(hotelId, input);
		} catch (error) {
			console.error('Query getHotelReviews failed', hotelId, input.page, error);
			throw error;
		}
	}

	/**
	 * Get user's own reviews
	 */
	@Query(() => ReviewsDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyReviews(
		@CurrentMember() currentMember: any,
		@Args('input') input: PaginationInput,
	): Promise<ReviewsDto> {
		try {
			console.log('Query getMyReviews', currentMember?._id ?? 'unknown', input.page);
			return this.reviewService.getMyReviews(currentMember, input);
		} catch (error) {
			console.error('Query getMyReviews failed', currentMember?._id ?? 'unknown', input.page, error);
			throw error;
		}
	}

	/**
	 * Hotel agent responds to review
	 */
	@Mutation(() => ReviewDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async respondToReview(
		@CurrentMember() currentMember: any,
		@Args('reviewId') reviewId: string,
		@Args('responseText') responseText: string,
	): Promise<ReviewDto> {
		try {
			console.log('Mutation respondToReview', currentMember?._id ?? 'unknown', reviewId);
			return this.reviewService.respondToReview(currentMember, reviewId, responseText);
		} catch (error) {
			console.error('Mutation respondToReview failed', currentMember?._id ?? 'unknown', reviewId, error);
			throw error;
		}
	}

	/**
	 * Mark review as helpful (toggle like)
	 */
	@Mutation(() => ReviewDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async markHelpful(
		@CurrentMember() currentMember: any,
		@Args('reviewId') reviewId: string,
	): Promise<ReviewDto> {
		try {
			console.log('Mutation markHelpful', currentMember?._id ?? 'unknown', reviewId);
			return this.reviewService.markHelpful(currentMember, reviewId);
		} catch (error) {
			console.error('Mutation markHelpful failed', currentMember?._id ?? 'unknown', reviewId, error);
			throw error;
		}
	}

	/**
	 * Update review status (admin only)
	 */
	@Mutation(() => ReviewDto)
	@Roles(MemberType.ADMIN)
	public async updateReviewStatus(
		@CurrentMember() currentMember: any,
		@Args('reviewId') reviewId: string,
		@Args('status', { type: () => ReviewStatus }) status: ReviewStatus,
	): Promise<ReviewDto> {
		try {
			console.log('Mutation updateReviewStatus', currentMember?._id ?? 'unknown', reviewId, status);
			return this.reviewService.updateReviewStatus(currentMember, reviewId, status);
		} catch (error) {
			console.error('Mutation updateReviewStatus failed', currentMember?._id ?? 'unknown', reviewId, error);
			throw error;
		}
	}
}
