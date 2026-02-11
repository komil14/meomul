import { Field, InputType, Int, Float } from '@nestjs/graphql';
import { IsOptional, IsEnum, IsArray, IsNumber, IsString, IsBoolean, Min, Max } from 'class-validator';
import { HotelType, HotelLocation } from '../../enums/hotel.enum';
import { RoomType } from '../../enums/room.enum';
import { StayPurpose } from '../../enums/common.enum';

@InputType()
export class PriceRangeInput {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Field(() => Int, { nullable: true })
  start?: number;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  end?: number;
}

@InputType()
export class HotelSearchInput {
  @IsOptional()
  @IsEnum(HotelLocation)
  @Field(() => HotelLocation, { nullable: true })
  location?: HotelLocation;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  dong?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  nearestSubway?: string;

  @IsOptional()
  @IsArray()
  @Field(() => [Int], { nullable: true })
  subwayLines?: number[];

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  maxWalkingDistance?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(HotelType, { each: true })
  @Field(() => [HotelType], { nullable: true })
  hotelTypes?: HotelType[];

  @IsOptional()
  @IsArray()
  @IsEnum(RoomType, { each: true })
  @Field(() => [RoomType], { nullable: true })
  roomTypes?: RoomType[];

  @IsOptional()
  @Field(() => PriceRangeInput, { nullable: true })
  priceRange?: PriceRangeInput;

  @IsOptional()
  @IsArray()
  @Field(() => [Int], { nullable: true })
  starRatings?: number[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Field(() => Float, { nullable: true })
  minRating?: number;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  amenities?: string[];

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  verifiedOnly?: boolean;

  @IsOptional()
  @IsEnum(StayPurpose)
  @Field(() => StayPurpose, { nullable: true })
  purpose?: StayPurpose;

  @IsOptional()
  @Field(() => Date, { nullable: true })
  checkInDate?: Date;

  @IsOptional()
  @Field(() => Date, { nullable: true })
  checkOutDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Field(() => Int, { nullable: true })
  guestCount?: number;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  petsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  wheelchairAccessible?: boolean;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  text?: string; // Free text search
}