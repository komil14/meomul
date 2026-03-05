import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ReviewInput } from '../../libs/dto/review/review.input';
import { ReviewUpdate } from '../../libs/dto/review/review.update';
import { ReviewDto } from '../../libs/dto/review/review';
import { ReviewsDto, ReviewRatingsSummaryDto } from '../../libs/dto/common/reviews';
import { HomeTestimonialDto } from '../../libs/dto/home/home';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { ReviewStatus, LikeGroup, ViewGroup } from '../../libs/enums/common.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { ReviewDocument } from '../../libs/types/review';
import { toReviewDto } from '../../libs/types/review';
import type { BookingDocument } from '../../libs/types/booking';
import type { HotelDocument } from '../../libs/types/hotel';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../libs/enums/common.enum';

@Injectable()
export class ReviewService {
	private readonly logger = new Logger(ReviewService.name);

	constructor(
		@InjectModel('Review') private readonly reviewModel: Model<ReviewDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly notificationService: NotificationService,
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
			reviewStatus: ReviewStatus.APPROVED, // Auto-approve for verified stays, can be changed to PENDING if manual moderation is desired
		});

		// Hotel review stats are updated only when admin approves the review

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.NEW_REVIEW,
				'New Review',
				`New review posted for hotel "${hotel.hotelTitle}"`,
				`/admin/reviews/${review._id.toString()}`,
			)
			.catch(() => {});

		// Notify hotel agent about new review (fire-and-forget)
		if (hotel.memberId) {
			this.notificationService
				.createAndPush(
					{
						userId: String(hotel.memberId),
						type: NotificationType.NEW_REVIEW,
						title: 'New Review',
						message: `A guest left a ${input.overallRating}-star review for "${hotel.hotelTitle}".`,
						link: `/hotels/${String(booking.hotelId)}`,
					},
					'REVIEW',
				)
				.catch(() => {});
		}

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

		const [list, total, ratingsSummaryRaw] = await Promise.all([
			this.reviewModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.reviewModel.countDocuments(query).exec(),
			this.reviewModel
				.aggregate<{
					totalReviews: number;
					overallRating: number;
					cleanlinessRating: number;
					locationRating: number;
					serviceRating: number;
					amenitiesRating: number;
					valueRating: number;
				}>([
					{ $match: query },
					{
						$group: {
							_id: null,
							totalReviews: { $sum: 1 },
							overallRating: { $avg: '$overallRating' },
							cleanlinessRating: { $avg: '$cleanlinessRating' },
							locationRating: { $avg: '$locationRating' },
							serviceRating: { $avg: '$serviceRating' },
							amenitiesRating: { $avg: '$amenitiesRating' },
							valueRating: { $avg: '$valueRating' },
						},
					},
					{ $project: { _id: 0 } },
				])
				.exec(),
		]);

		const ratingsSummary = this.toRatingsSummary(ratingsSummaryRaw[0]);
		const listWithProfiles = await this.attachReviewerProfiles(list);

		return {
			list: listWithProfiles,
			metaCounter: { total },
			ratingsSummary,
		};
	}

	/**
	 * Homepage testimonials feed (single query, no client fan-out).
	 */
	public async getHomeTestimonials(limit: number = 6): Promise<HomeTestimonialDto[]> {
		const safeLimit = Math.max(1, Math.min(limit, 20));
		const candidateLimit = safeLimit * 5;

		const reviews = await this.reviewModel
			.find({
				reviewStatus: ReviewStatus.APPROVED,
				verifiedStay: true,
			})
			.sort({ stayDate: -1, createdAt: -1 })
			.limit(candidateLimit)
			.exec();

		if (reviews.length === 0) {
			return [];
		}

		const hotelIds = Array.from(new Set(reviews.map((review) => String(review.hotelId))));
		const reviewerIds = Array.from(new Set(reviews.map((review) => String(review.reviewerId))));
		const hotels = await this.hotelModel
			.find({ _id: { $in: hotelIds } })
			.select('_id hotelTitle')
			.exec();
		const reviewers = await this.memberModel
			.find({ _id: { $in: reviewerIds } })
			.select('_id memberNick memberImage')
			.exec();

		const hotelTitleById = new Map<string, string>(hotels.map((hotel) => [String(hotel._id), hotel.hotelTitle]));
		const reviewerById = new Map<string, { memberNick?: string; memberImage?: string }>(
			reviewers.map((member) => [
				String(member._id),
				{
					memberNick: member.memberNick,
					memberImage: member.memberImage,
				},
			]),
		);

		const list: HomeTestimonialDto[] = [];
		for (const review of reviews) {
			const hotelId = String(review.hotelId);
			const hotelTitle = hotelTitleById.get(hotelId);
			if (!hotelTitle) {
				continue;
			}

			const reviewDto = toReviewDto(review);
			const reviewer = reviewerById.get(String(review.reviewerId));
			const reviewerNick =
				reviewer?.memberNick?.trim() || reviewDto.reviewerNick?.trim() || `guest${String(review.reviewerId).slice(-4)}`;

			list.push({
				hotelId,
				hotelTitle,
				review: {
					...reviewDto,
					reviewerNick,
					reviewerImage: reviewer?.memberImage ?? reviewDto.reviewerImage,
				},
			});

			if (list.length >= safeLimit) {
				break;
			}
		}

		return list;
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
			list: await this.attachReviewerProfiles(list),
			metaCounter: { total },
		};
	}

	/**
	 * Get all reviews (admin only) — includes FLAGGED, REMOVED
	 */
	public async getAllReviewsAdmin(input: PaginationInput, statusFilter?: ReviewStatus): Promise<ReviewsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {};
		if (statusFilter) {
			query.reviewStatus = statusFilter;
		}

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
			list: await this.attachReviewerProfiles(list),
			metaCounter: { total },
		};
	}

	private static isValidImage(image?: string): boolean {
		return !!image && image !== '' && !image.includes('default-avatar');
	}

	private async attachReviewerProfiles(list: ReviewDocument[]): Promise<ReviewDto[]> {
		if (list.length === 0) {
			return [];
		}

		const reviewerIds = Array.from(new Set(list.map((review) => String(review.reviewerId))));
		const reviewers = await this.memberModel
			.find({ _id: { $in: reviewerIds } })
			.select({ _id: 1, memberNick: 1, memberImage: 1 })
			.lean<{ _id: string; memberNick?: string; memberImage?: string }[]>()
			.exec();

		const reviewerById = new Map(
			reviewers.map((member) => [
				String(member._id),
				{
					memberNick: member.memberNick,
					memberImage: ReviewService.isValidImage(member.memberImage) ? member.memberImage : undefined,
				},
			]),
		);

		return list.map((review) => {
			const dto = toReviewDto(review);
			const profile = reviewerById.get(String(review.reviewerId));

			return {
				...dto,
				reviewerNick: profile?.memberNick ?? dto.reviewerNick,
				reviewerImage: profile?.memberImage ?? dto.reviewerImage,
			};
		});
	}

	private toRatingsSummary(raw?: {
		totalReviews: number;
		overallRating: number;
		cleanlinessRating: number;
		locationRating: number;
		serviceRating: number;
		amenitiesRating: number;
		valueRating: number;
	}): ReviewRatingsSummaryDto | undefined {
		if (!raw || raw.totalReviews <= 0) {
			return undefined;
		}

		const clamp = (value: number): number => Number((Number.isFinite(value) ? value : 0).toFixed(2));

		return {
			totalReviews: raw.totalReviews,
			overallRating: clamp(raw.overallRating),
			cleanlinessRating: clamp(raw.cleanlinessRating),
			locationRating: clamp(raw.locationRating),
			serviceRating: clamp(raw.serviceRating),
			amenitiesRating: clamp(raw.amenitiesRating),
			valueRating: clamp(raw.valueRating),
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

		if (String(hotel.memberId) !== String(currentMember._id) && currentMember.memberType !== MemberType.ADMIN) {
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

		// Notify the reviewer that the hotel responded (fire-and-forget)
		if (review.reviewerId) {
			this.notificationService
				.createAndPush(
					{
						userId: String(review.reviewerId),
						type: NotificationType.HOTEL_REPLY,
						title: 'Hotel Responded to Your Review',
						message: `${hotel.hotelTitle ?? 'The hotel'} responded to your review.`,
						link: `/hotels/${String(review.hotelId)}`,
					},
					'REVIEW',
				)
				.catch(() => {});
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
			this.logger.error('Error updating hotel review stats:', error);
		}
	}
}
