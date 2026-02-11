import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';

@ObjectType()
export class FollowDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  followerId: ObjectId;

  @Field(() => String)
  followingId: ObjectId;

  @Field(() => Date)
  createdAt: Date;
}