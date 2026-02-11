import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { NotificationType } from '../../enums/common.enum';

@ObjectType()
export class NotificationDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  userId: ObjectId;

  @Field(() => NotificationType)
  type: NotificationType;

  @Field(() => String)
  title: string;

  @Field(() => String)
  message: string;

  @Field(() => String, { nullable: true })
  link?: string;

  @Field(() => Boolean)
  read: boolean;

  @Field(() => Date)
  createdAt: Date;
}