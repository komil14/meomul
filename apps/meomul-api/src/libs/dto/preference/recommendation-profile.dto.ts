import { Field, Float, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class RecommendationProfileDto {
	@Field(() => Boolean)
	hasProfile: boolean;

	@Field(() => String, { nullable: true })
	source?: 'onboarding' | 'computed';

	@Field(() => [String])
	preferredLocations: string[];

	@Field(() => [String])
	preferredTypes: string[];

	@Field(() => [String])
	preferredPurposes: string[];

	@Field(() => [String])
	preferredAmenities: string[];

	@Field(() => Float, { nullable: true })
	avgPriceMin?: number;

	@Field(() => Float, { nullable: true })
	avgPriceMax?: number;

	@Field(() => Date, { nullable: true })
	computedAt?: Date;
}
