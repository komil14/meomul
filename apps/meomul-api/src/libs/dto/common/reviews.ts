import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ReviewDto } from '../review/review';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class ReviewRatingsSummaryDto {
	@Field(() => Int)
	totalReviews: number;

	@Field(() => Float)
	overallRating: number;

	@Field(() => Float)
	cleanlinessRating: number;

	@Field(() => Float)
	locationRating: number;

	@Field(() => Float)
	serviceRating: number;

	@Field(() => Float)
	amenitiesRating: number;

	@Field(() => Float)
	valueRating: number;
}

@ObjectType()
export class ReviewsDto {
	@Field(() => [ReviewDto])
	list: ReviewDto[];

	@Field(() => MetaCounterDto)
	metaCounter: MetaCounterDto;

	@Field(() => ReviewRatingsSummaryDto, { nullable: true })
	ratingsSummary?: ReviewRatingsSummaryDto;
}
