import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';

@ObjectType()
export class BookingGuestCandidateDto {
	@Field(() => String)
	_id: ObjectId;

	@Field(() => String)
	memberNick: string;

	@Field(() => String)
	memberPhone: string;

	@Field(() => String, { nullable: true })
	memberFullName?: string;
}
