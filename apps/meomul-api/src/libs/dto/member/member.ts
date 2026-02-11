import { Field, ObjectType, Int, Float } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { MemberType, MemberStatus, MemberAuthType, SubscriptionTier } from '../../enums/member.enum';

@ObjectType()
export class MemberDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => MemberType)
  memberType: MemberType;

  @Field(() => MemberStatus)
  memberStatus: MemberStatus;

  @Field(() => MemberAuthType)
  memberAuthType: MemberAuthType;

  @Field(() => String)
  memberPhone: string;

  @Field(() => String)
  memberNick: string;

  @Field(() => String, { nullable: true })
  memberFullName?: string;

  @Field(() => String, { nullable: true })
  memberImage?: string;

  @Field(() => String, { nullable: true })
  memberAddress?: string;

  @Field(() => String, { nullable: true })
  memberDesc?: string;

  // Subscription
  @Field(() => SubscriptionTier)
  subscriptionTier: SubscriptionTier;

  @Field(() => Date, { nullable: true })
  subscriptionExpiry?: Date;

  // Points & Gamification
  @Field(() => Int)
  memberPoints: number;

  @Field(() => [String])
  memberBadges: string[];

  // Statistics
  @Field(() => Int)
  memberProperties: number;

  @Field(() => Int)
  memberArticles: number;

  @Field(() => Int)
  memberFollowers: number;

  @Field(() => Int)
  memberFollowings: number;

  @Field(() => Int)
  memberViews: number;

  @Field(() => Int)
  memberLikes: number;

  @Field(() => Int)
  memberComments: number;

  @Field(() => Float)
  memberRank: number;

  // Timestamps
  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}