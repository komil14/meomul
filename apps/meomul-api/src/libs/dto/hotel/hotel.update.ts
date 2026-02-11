import { Field, InputType, Int } from '@nestjs/graphql';
import { IsOptional, IsString, IsEnum, IsNumber, IsBoolean, IsArray, Min, Max, IsNotEmpty } from 'class-validator';
import { HotelStatus, BadgeLevel, CancellationPolicy } from '../../enums/hotel.enum';
import { AmenitiesInput, SafetyFeaturesInput, FlexibleTimingInput } from './hotel.input';

@InputType()
export class HotelUpdate {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  _id: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  hotelTitle?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  hotelDesc?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Int, { nullable: true })
  starRating?: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  checkInTime?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  checkOutTime?: string;

  @IsOptional()
  @Field(() => FlexibleTimingInput, { nullable: true })
  flexibleCheckIn?: FlexibleTimingInput;

  @IsOptional()
  @Field(() => FlexibleTimingInput, { nullable: true })
  flexibleCheckOut?: FlexibleTimingInput;

  @IsOptional()
  @IsEnum(CancellationPolicy)
  @Field(() => CancellationPolicy, { nullable: true })
  cancellationPolicy?: CancellationPolicy;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  petsAllowed?: boolean;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  maxPetWeight?: number;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  smokingAllowed?: boolean;

  @IsOptional()
  @Field(() => AmenitiesInput, { nullable: true })
  amenities?: AmenitiesInput;

  @IsOptional()
  @Field(() => SafetyFeaturesInput, { nullable: true })
  safetyFeatures?: SafetyFeaturesInput;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  suitableFor?: string[];

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  hotelImages?: string[];

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  hotelVideos?: string[];

  @IsOptional()
  @IsEnum(HotelStatus)
  @Field(() => HotelStatus, { nullable: true })
  hotelStatus?: HotelStatus;

  @IsOptional()
  @IsEnum(BadgeLevel)
  @Field(() => BadgeLevel, { nullable: true })
  badgeLevel?: BadgeLevel;
}