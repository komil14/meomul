import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ReviewInput } from '../../libs/dto/review/review.input';
import { ReviewUpdate } from '../../libs/dto/review/review.update';
import { ReviewDto } from '../../libs/dto/review/review';
import { ReviewsDto } from '../../libs/dto/common/reviews';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { ReviewStatus, LikeGroup, ViewGroup } from '../../libs/enums/common.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { ReviewDocument } from '../../libs/types/review';
import { toReviewDto } from '../../libs/types/review';
import type { BookingDocument } from '../../libs/types/booking';
import type { HotelDocument } from '../../libs/types/hotel';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';

@Injectable()
export class ReviewService {
	constructor(
		@InjectModel('Review') private readonly reviewModel: Model<ReviewDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
	) {}

	/**
	 * Create a review for a completed booking
	 */
	public async createReview(currentMember: MemberJwtPayload, input: ReviewInput): Promise<ReviewDto> {
		// Check member status
		if (currentMember.memberStatus !== MemberStatus.ACTIVE) {
			throw new ForbiddenException(Messages.NOT_AUTHENTICATED);
		}

		// Verify booking exists
		const booking = await this.bookingModel.findById(input.bookingId).exec();
		if (!booking) {
			throw new NotFoundException('Booking not found');
		}

		// Verify booking belongs to the user
		if (String(booking.guestId) !== String(currentMember._id)) {
			throw new ForbiddenException('You can only review your own bookings');
		}

		// Verify booking is completed
		if (booking.bookingStatus !== BookingStatus.CHECKED_OUT) {
			throw new BadRequestException('You can only review completed stays');
		}

		// Check if review already exists for this booking
		const existingReview = await this.reviewModel.findOne({ bookingId: input.bookingId }).exec();
		if (existingReview) {
			throw new BadRequestException('You have already reviewed this stay');
		}

		// Verify hotel exists
		const hotel = await this.hotelModel.findById(booking.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException('Hotel not found');
		}

		// Create review
		const review = await this.reviewModel.create({
			reviewerId: currentMember._id,
			hotelId: booking.hotelId,
			bookingId: input.bookingId,
			verifiedStay: true,
			stayDate: booking.checkInDate,
			overallRating: input.overallRating,
			cleanlinessRating: input.cleanlinessRating,
			locationRating: input.locationRating,
			valueRating: input.valueRating,
			serviceRating: input.serviceRating,
			amenitiesRating: input.amenitiesRating,
			reviewTitle: input.reviewTitle,
			reviewText: input.reviewText,
			guestPhotos: input.guestPhotos || [],
			helpfulCount: 0,
			reviewStatus: ReviewStatus.APPROVED, // Auto-approve for now
		});

		// Update hotel review stats
		await this.updateHotelReviewStats(String(booking.hotelId));

		return toReviewDto(review);
	}

	/**
	 * Update review (only by reviewer, only before moderation)
	 */
	public async updateReview(currentMember: MemberJwtPayload, input: ReviewUpdate): Promise<ReviewDto> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		const review = await this.reviewModel.findById(input._id).exec();
		if (!review) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only reviewer can update their own review
		if (String(review.reviewerId) !== String(currentMember._id)) {
			throw new ForbiddenException('You can only update your own reviews');
		}

		// Cannot update removed or flagged reviews
		if (review.reviewStatus === ReviewStatus.REMOVED || review.reviewStatus === ReviewStatus.FLAGGED) {
			throw new BadRequestException('Cannot update removed or flagged reviews');
		}

		// Build update payload
		const updateData: Record<string, unknown> = {};
		if (input.reviewTitle !== undefined) updateData.reviewTitle = input.reviewTitle;
		if (input.reviewText !== undefined) updateData.reviewText = input.reviewText;

		const updatedReview = await this.reviewModel
			.findByIdAndUpdate(input._id, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedReview) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toReviewDto(updatedReview);
	}

	/**
	 * Delete review (soft delete by setting status to REMOVED)
	 */
	public async deleteReview(currentMember: MemberJwtPayload, reviewId: string): Promise<ReviewDto> {
		const review = await this.reviewModel.findById(reviewId).exec();
		if (!review) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only reviewer or admin can delete
		const isReviewer = String(review.reviewerId) === String(currentMember._id);
		const isAdmin = currentMember.memberType === MemberType.ADMIN;

		if (!isReviewer && !isAdmin) {
			throw new ForbiddenException('You can only delete your own reviews');
		}

		const updatedReview = await this.reviewModel
			.findByIdAndUpdate(reviewId, { reviewStatus: ReviewStatus.REMOVED }, { returnDocument: 'after' })
			.exec();

		if (!updatedReview) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Update hotel review stats
		await this.updateHotelReviewStats(String(review.hotelId));

		return toReviewDto(updatedReview);
	}

	/**
	 * Get single review
	 */
	public async getReview(reviewId: string, currentMember?: MemberJwtPayload): Promise<ReviewDto> {
		const review = await this.reviewModel.findById(reviewId).exec();
		if (!review) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only show approved reviews to public
		if (review.reviewStatus !== ReviewStatus.APPROVED) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Track view for authenticated users only (idempotent - same user counts as 1 view)
		if (currentMember) {
			const result = await this.viewService.recordView(currentMember, {
				viewGroup: ViewGroup.REVIEW,
				viewRefId: reviewId,
			});

			// Only increment count for NEW views (not repeat views from same user)
			if (result.isNewView) {
				await this.reviewModel.findByIdAndUpdate(reviewId, { $inc: { reviewViews: 1 } }).exec();
			}
		}

		// Return review with current view count
		const updatedReview = await this.reviewModel.findById(reviewId).exec();
		return toReviewDto(updatedReview!);
	}

	/**
	 * Get hotel reviews (paginated, public)
	 */
	public async getHotelReviews(hotelId: string, input: PaginationInput): Promise<ReviewsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			hotelId,
			reviewStatus: ReviewStatus.APPROVED,
		};

		const [list, total] = await Promise.all([
			this.reviewModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.reviewModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toReviewDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get user's own reviews
	 */
	public async getMyReviews(currentMember: MemberJwtPayload, input: PaginationInput): Promise<ReviewsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			reviewerId: currentMember._id,
		};

		const [list, total] = await Promise.all([
			this.reviewModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.reviewModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toReviewDto),
			metaCounter: { total },
		};
	}

	/**
	 * Hotel agent responds to review
	 */
	public async respondToReview(
		currentMember: MemberJwtPayload,
		reviewId: string,
		responseText: string,
	): Promise<ReviewDto> {
		// Only agents can respond
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const review = await this.reviewModel.findById(reviewId).exec();
		if (!review) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Verify hotel ownership
		const hotel = await this.hotelModel.findById(review.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException('You can only respond to reviews for your hotel');
		}

		// Check if already responded
		if (review.hotelResponse && review.hotelResponse.responseText) {
			throw new BadRequestException('You have already responded to this review');
		}

		const updatedReview = await this.reviewModel
			.findByIdAndUpdate(
				reviewId,
				{
					$set: {
						'hotelResponse.responseText': responseText,
						'hotelResponse.respondedBy': currentMember._id,
						'hotelResponse.respondedAt': new Date(),
					},
				},
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedReview) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toReviewDto(updatedReview);
	}

	/**
	 * Mark review as helpful (toggle using Like system)
	 */
	public async markHelpful(currentMember: MemberJwtPayload, reviewId: string): Promise<ReviewDto> {
		// Verify review exists
		const review = await this.reviewModel.findById(reviewId).exec();
		if (!review) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Toggle like using Like service
		const result = await this.likeService.toggleLike(currentMember, {
			likeGroup: LikeGroup.REVIEW,
			likeRefId: reviewId,
		});

		// Update helpfulCount in review
		await this.reviewModel
			.findByIdAndUpdate(reviewId, {
				helpfulCount: result.likeCount,
			})
			.exec();

		// Return updated review
		const updatedReview = await this.reviewModel.findById(reviewId).exec();
		if (!updatedReview) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toReviewDto(updatedReview);
	}

	/**
	 * Update review status (admin only)
	 */
	public async updateReviewStatus(
		currentMember: MemberJwtPayload,
		reviewId: string,
		status: ReviewStatus,
	): Promise<ReviewDto> {
		if (currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const review = await this.reviewModel
			.findByIdAndUpdate(reviewId, { reviewStatus: status }, { returnDocument: 'after' })
			.exec();

		if (!review) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Update hotel stats if status changed to/from APPROVED
		await this.updateHotelReviewStats(String(review.hotelId));

		return toReviewDto(review);
	}

	/**
	 * Update hotel review statistics
	 */
	private async updateHotelReviewStats(hotelId: string): Promise<void> {
		try {
			const reviews = await this.reviewModel
				.find({
					hotelId,
					reviewStatus: ReviewStatus.APPROVED,
				})
				.exec();

			if (reviews.length === 0) {
				// Reset stats if no approved reviews
				await this.hotelModel
					.findByIdAndUpdate(hotelId, {
						hotelRank: 0,
						hotelReviews: 0,
					})
					.exec();
				return;
			}

			// Calculate average rating
			const totalRating = reviews.reduce((sum, review) => sum + review.overallRating, 0);
			const averageRating = totalRating / reviews.length;

			// Update hotel
			await this.hotelModel
				.findByIdAndUpdate(hotelId, {
					hotelRank: averageRating,
					hotelReviews: reviews.length,
				})
				.exec();
		} catch (error) {
			console.error('Error updating hotel review stats:', error);
		}
	}
}
