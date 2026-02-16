import { Field, InputType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsOptional, ArrayMaxSize } from 'class-validator';
import { TravelStyle, BudgetLevel } from '../../enums/preference.enum';
import { HotelLocation } from '../../enums/hotel.enum';

@InputType()
export class OnboardingPreferenceInput {
	@IsArray()
	@IsEnum(TravelStyle, { each: true })
	@ArrayMaxSize(3)
	@Field(() => [TravelStyle])
	travelStyles: TravelStyle[];

	@IsArray()
	@ArrayMaxSize(5)
	@Field(() => [String])
	preferredAmenities: string[];

	@IsOptional()
	@IsEnum(BudgetLevel)
	@Field(() => BudgetLevel, { nullable: true })
	budgetLevel?: BudgetLevel;

	@IsArray()
	@IsEnum(HotelLocation, { each: true })
	@ArrayMaxSize(4)
	@Field(() => [HotelLocation])
	preferredDestinations: HotelLocation[];
}
