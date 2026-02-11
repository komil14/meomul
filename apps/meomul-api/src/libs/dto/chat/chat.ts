import { Field, ObjectType, Int } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ChatStatus, MessageType, SenderType } from '../../enums/common.enum';

@ObjectType()
export class MessageDto {
  @Field(() => String)
  senderId: ObjectId;

  @Field(() => SenderType)
  senderType: SenderType;

  @Field(() => MessageType)
  messageType: MessageType;

  @Field(() => String, { nullable: true })
  content?: string;

  @Field(() => String, { nullable: true })
  imageUrl?: string;

  @Field(() => String, { nullable: true })
  fileUrl?: string;

  @Field(() => Date)
  timestamp: Date;

  @Field(() => Boolean)
  read: boolean;
}

@ObjectType()
export class ChatDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  guestId: ObjectId;

  @Field(() => String)
  hotelId: ObjectId;

  @Field(() => String, { nullable: true })
  assignedAgentId?: ObjectId;

  @Field(() => String, { nullable: true })
  bookingId?: ObjectId;

  @Field(() => [MessageDto])
  messages: MessageDto[];

  @Field(() => ChatStatus)
  chatStatus: ChatStatus;

  @Field(() => Int)
  unreadGuestMessages: number;

  @Field(() => Int)
  unreadAgentMessages: number;

  @Field(() => Date)
  lastMessageAt: Date;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}