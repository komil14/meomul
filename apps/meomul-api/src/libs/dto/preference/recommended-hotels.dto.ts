import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { HotelDto } from '../hotel/hotel';

@ObjectType()
export class RecommendationMetaDto {
	@Field(() => String)
	profileSource: 'onboarding' | 'computed';

	@Field(() => Float)
	onboardingWeight: number;

	@Field(() => Float)
	behaviorWeight: number;

	@Field(() => Int)
	matchedLocationCount: number;

	@Field(() => Int)
	fallbackCount: number;

	@Field(() => Int)
	strictStageCount: number;

	@Field(() => Int)
	relaxedStageCount: number;

	@Field(() => Int)
	generalStageCount: number;
}

@ObjectType()
export class RecommendedHotelsV2Dto {
	@Field(() => [HotelDto])
	list: HotelDto[];

	@Field(() => RecommendationMetaDto)
	meta: RecommendationMetaDto;
}
