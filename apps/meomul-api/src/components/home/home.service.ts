import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { HomeFeedInput } from '../../libs/dto/home/home.input';
import { HomeFeedDto } from '../../libs/dto/home/home';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { ReviewDto } from '../../libs/dto/review/review';
import { ReviewRatingsSummaryDto } from '../../libs/dto/common/reviews';
import { RecommendationService } from '../recommendation/recommendation.service';
import { HotelService } from '../hotel/hotel.service';
import { RoomService } from '../room/room.service';
import { ReviewService } from '../review/review.service';

@Injectable()
export class HomeService {
	constructor(
		private readonly hotelService: HotelService,
		private readonly roomService: RoomService,
		private readonly reviewService: ReviewService,
		private readonly recommendationService: RecommendationService,
	) {}

	public async getHomeFeed(input?: HomeFeedInput, memberId?: string): Promise<HomeFeedDto> {
		const heroLimit = this.clamp(input?.heroLimit, 5, 1, 20);
		const trendingLimit = this.clamp(input?.trendingLimit, 10, 1, 30);
		const dealsLimit = this.clamp(input?.dealsLimit, 8, 1, 20);
		const testimonialsLimit = this.clamp(input?.testimonialsLimit, 6, 1, 20);
		const featuredReviewLimit = this.clamp(input?.featuredReviewLimit, 5, 1, 12);
		const recommendationLimit = this.clamp(input?.recommendationLimit, 6, 1, 20);

		const heroPagination: PaginationInput = {
			page: 1,
			limit: heroLimit,
			sort: 'hotelRank',
			direction: Direction.DESC,
		};

		const featuredReviewPagination: PaginationInput = {
			page: 1,
			limit: featuredReviewLimit,
			sort: 'createdAt',
			direction: Direction.DESC,
		};

		const [topHotelsResult, trendingHotels, lastMinuteDeals, testimonials, recommendationResult] = await Promise.all([
			this.hotelService.getHotels(heroPagination),
			this.recommendationService.getTrendingHotels(trendingLimit),
			this.roomService.getHomeLastMinuteDeals(dealsLimit),
			this.reviewService.getHomeTestimonials(testimonialsLimit),
			memberId
				? this.recommendationService.getRecommendedHotelsV2(memberId, recommendationLimit)
				: Promise.resolve(null),
		]);

		const topHotels = topHotelsResult.list;
		const hotelInventoryTotal = topHotelsResult.metaCounter.total;
		const featuredHotelRawId: unknown = topHotels[0]?._id;
		const featuredHotelId = featuredHotelRawId ? this.toIdString(featuredHotelRawId) : null;

		let featuredReviews: ReviewDto[] = [];
		let featuredRatingsSummary: ReviewRatingsSummaryDto | null = null;
		if (featuredHotelId) {
			const featuredReviewResult = await this.reviewService.getHotelReviews(featuredHotelId, featuredReviewPagination);
			featuredReviews = featuredReviewResult.list;
			featuredRatingsSummary = featuredReviewResult.ratingsSummary ?? null;
		}

		return {
			topHotels,
			hotelInventoryTotal,
			trendingHotels,
			featuredReviews,
			featuredRatingsSummary,
			lastMinuteDeals,
			testimonials,
			recommendationMeta: recommendationResult?.meta ?? null,
		};
	}

	private clamp(value: number | undefined, fallback: number, min: number, max: number): number {
		if (value === undefined || !Number.isFinite(value)) {
			return fallback;
		}

		return Math.min(max, Math.max(min, Math.trunc(value)));
	}

	private hasHexStringMethod(value: unknown): value is { toHexString(): string } {
		return (
			typeof value === 'object' &&
			value !== null &&
			typeof (value as { toHexString?: unknown }).toHexString === 'function'
		);
	}

	private toIdString(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}

		if (value instanceof Types.ObjectId) {
			return value.toString();
		}

		if (this.hasHexStringMethod(value)) {
			return value.toHexString();
		}

		throw new TypeError('Unsupported home id value');
	}
}
