import { Field, ObjectType, Int } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';

@ObjectType()
export class PriceLockDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  userId: ObjectId;

  @Field(() => String)
  roomId: ObjectId;

  @Field(() => Int)
  lockedPrice: number;

  @Field(() => Date)
  expiresAt: Date;

  @Field(() => Date)
  createdAt: Date;
}