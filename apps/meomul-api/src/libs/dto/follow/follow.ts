import { Field, ObjectType, Int } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { MetaCounterDto } from '../common/pagination';
import { MemberStatus } from '../../enums/member.enum';

/**
 * Basic member info for populated follow data
 */
@ObjectType()
export class MemberBasicDto {
  @Field(() => String)
  _id: ObjectId;

  @Field(() => String)
  memberNick: string;

  @Field(() => String, { nullable: true })
  memberFullName?: string;

  @Field(() => String, { nullable: true })
  memberImage?: string;

  @Field(() => MemberStatus)
  memberStatus: MemberStatus;

  @Field(() => Int)
  memberFollowers: number;

  @Field(() => Int)
  memberFollowings: number;
}

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

  // Enhanced fields (populated data)
  @Field(() => MemberBasicDto, { nullable: true })
  followerData?: MemberBasicDto;

  @Field(() => MemberBasicDto, { nullable: true })
  followingData?: MemberBasicDto;

  // Contextual metadata (lookup helpers)
  @Field(() => Boolean, { nullable: true })
  meFollowed?: boolean;  // Did current user follow this person?

  @Field(() => Boolean, { nullable: true })
  meLiked?: boolean;  // Did current user like this person?
}

@ObjectType()
export class Followers {
  @Field(() => [FollowDto])
  list: FollowDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}

@ObjectType()
export class Followings {
  @Field(() => [FollowDto])
  list: FollowDto[];

  @Field(() => MetaCounterDto)
  metaCounter: MetaCounterDto;
}