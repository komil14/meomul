import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class PriceLockDto {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	userId: string;

	@Field(() => String)
	roomId: string;

	@Field(() => Int)
	lockedPrice: number;

	@Field(() => Date)
	expiresAt: Date;

	@Field(() => Date)
	createdAt: Date;
}
