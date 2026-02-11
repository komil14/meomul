import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ViewGroup } from '../../enums/common.enum';

@ObjectType()
export class ViewDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => ViewGroup)
  viewGroup: ViewGroup;

  @Field(() => String)
  viewRefId: ObjectId;

  @Field(() => String)
  memberId: ObjectId;

  @Field(() => Date)
  createdAt: Date;
}