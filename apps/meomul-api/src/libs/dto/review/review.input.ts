import { Field, InputType, Float } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsArray, Min, Max, Length } from 'class-validator';

@InputType()
export class ReviewInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  bookingId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Float)
  overallRating: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Float)
  cleanlinessRating: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Float)
  locationRating: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Float)
  valueRating: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Float)
  serviceRating: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Field(() => Float)
  amenitiesRating: number;

  @IsOptional()
  @IsString()
  @Length(5, 100)
  @Field(() => String, { nullable: true })
  reviewTitle?: string;

  @IsNotEmpty()
  @IsString()
  @Length(10, 1000)
  @Field(() => String)
  reviewText: string;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { defaultValue: [] })
  guestPhotos: string[];
}