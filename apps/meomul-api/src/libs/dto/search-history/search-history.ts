import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { HotelLocation, HotelType } from '../../enums/hotel.enum';
import { StayPurpose } from '../../enums/common.enum';

@ObjectType()
export class SearchHistoryDto {
	@Field(() => String)
	_id: ObjectId;

	@Field(() => String)
	memberId: ObjectId;

	@Field(() => HotelLocation, { nullable: true })
	location?: HotelLocation;

	@Field(() => [HotelType], { nullable: true })
	hotelTypes?: HotelType[];

	@Field(() => Int, { nullable: true })
	priceMin?: number;

	@Field(() => Int, { nullable: true })
	priceMax?: number;

	@Field(() => StayPurpose, { nullable: true })
	purpose?: StayPurpose;

	@Field(() => [String], { nullable: true })
	amenities?: string[];

	@Field(() => [Float], { nullable: true })
	starRatings?: number[];

	@Field(() => Int, { nullable: true })
	guestCount?: number;

	@Field(() => String, { nullable: true })
	text?: string;

	@Field(() => Date)
	createdAt: Date;
}
