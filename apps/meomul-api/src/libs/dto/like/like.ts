import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { LikeGroup } from '../../enums/common.enum';

@ObjectType()
export class LikeDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => LikeGroup)
  likeGroup: LikeGroup;

  @Field(() => String)
  likeRefId: ObjectId;

  @Field(() => String)
  memberId: ObjectId;

  @Field(() => Date)
  createdAt: Date;
}