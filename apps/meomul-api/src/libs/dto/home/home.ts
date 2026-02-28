import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { HotelDto } from '../hotel/hotel';
import { RecommendationMetaDto } from '../preference/recommended-hotels.dto';
import { ReviewDto } from '../review/review';
import { ReviewRatingsSummaryDto } from '../common/reviews';

@ObjectType()
export class HomeLastMinuteDealDto {
	@Field(() => String)
	roomId: string;

	@Field(() => String)
	hotelId: string;

	@Field(() => String)
	hotelTitle: string;

	@Field(() => String)
	hotelLocation: string;

	@Field(() => String)
	roomName: string;

	@Field(() => String)
	roomType: string;

	@Field(() => String)
	imageUrl: string;

	@Field(() => Int)
	basePrice: number;

	@Field(() => Int)
	dealPrice: number;

	@Field(() => Float)
	discountPercent: number;

	@Field(() => Date)
	validUntil: Date;
}

@ObjectType()
export class HomeTestimonialDto {
	@Field(() => String)
	hotelId: string;

	@Field(() => String)
	hotelTitle: string;

	@Field(() => ReviewDto)
	review: ReviewDto;
}

@ObjectType()
export class HomeFeedDto {
	@Field(() => [HotelDto])
	topHotels: HotelDto[];

	@Field(() => Int)
	hotelInventoryTotal: number;

	@Field(() => [HotelDto])
	trendingHotels: HotelDto[];

	@Field(() => [ReviewDto])
	featuredReviews: ReviewDto[];

	@Field(() => ReviewRatingsSummaryDto, { nullable: true })
	featuredRatingsSummary?: ReviewRatingsSummaryDto | null;

	@Field(() => [HomeLastMinuteDealDto])
	lastMinuteDeals: HomeLastMinuteDealDto[];

	@Field(() => [HomeTestimonialDto])
	testimonials: HomeTestimonialDto[];

	@Field(() => RecommendationMetaDto, { nullable: true })
	recommendationMeta?: RecommendationMetaDto | null;
}
