import { Field, ObjectType, Int, Float } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ReviewStatus } from '../../enums/common.enum';

@ObjectType()
export class HotelResponseDto {
  @Field(() => String)
  responseText: string;

  @Field(() => String)
  respondedBy: ObjectId;

  @Field(() => Date)
  respondedAt: Date;
}

@ObjectType()
export class ReviewDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  reviewerId: ObjectId;

  @Field(() => String)
  hotelId: ObjectId;

  @Field(() => String)
  bookingId: ObjectId;

  @Field(() => Boolean)
  verifiedStay: boolean;

  @Field(() => Date)
  stayDate: Date;

  @Field(() => Float)
  overallRating: number;

  @Field(() => Float)
  cleanlinessRating: number;

  @Field(() => Float)
  locationRating: number;

  @Field(() => Float)
  valueRating: number;

  @Field(() => Float)
  serviceRating: number;

  @Field(() => Float)
  amenitiesRating: number;

  @Field(() => String, { nullable: true })
  reviewTitle?: string;

  @Field(() => String)
  reviewText: string;

  @Field(() => [String])
  guestPhotos: string[];

  @Field(() => Int)
  helpfulCount: number;

  @Field(() => Int)
  reviewViews: number;

  @Field(() => HotelResponseDto, { nullable: true })
  hotelResponse?: HotelResponseDto;

  @Field(() => ReviewStatus)
  reviewStatus: ReviewStatus;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}