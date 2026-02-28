import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ReviewDto } from '../review/review';

@ObjectType()
export class HomeLastMinuteDealDto {
	@Field(() => String)
	roomId: string;

	@Field(() => String)
	hotelId: string;

	@Field(() => String)
	hotelTitle: string;

	@Field(() => String)
	hotelLocation: string;

	@Field(() => String)
	roomName: string;

	@Field(() => String)
	roomType: string;

	@Field(() => String)
	imageUrl: string;

	@Field(() => Int)
	basePrice: number;

	@Field(() => Int)
	dealPrice: number;

	@Field(() => Float)
	discountPercent: number;

	@Field(() => Date)
	validUntil: Date;
}

@ObjectType()
export class HomeTestimonialDto {
	@Field(() => String)
	hotelId: string;

	@Field(() => String)
	hotelTitle: string;

	@Field(() => ReviewDto)
	review: ReviewDto;
}
