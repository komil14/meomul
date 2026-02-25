import { Field, InputType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsOptional, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { TravelStyle, BudgetLevel } from '../../enums/preference.enum';
import { HotelLocation } from '../../enums/hotel.enum';

@InputType()
export class OnboardingPreferenceInput {
	@IsArray()
	@ArrayMinSize(1)
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
	@ArrayMinSize(1)
	@IsEnum(HotelLocation, { each: true })
	@ArrayMaxSize(4)
	@Field(() => [HotelLocation])
	preferredDestinations: HotelLocation[];
}
