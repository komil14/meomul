import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, IsEnum, Length } from 'class-validator';
import { MemberStatus, SubscriptionTier } from '../../enums/member.enum';

@InputType()
export class MemberUpdate {
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  _id: string;

  @IsOptional()
  @IsEnum(MemberStatus)
  @Field(() => MemberStatus, { nullable: true })
  memberStatus?: MemberStatus;

  @IsOptional()
  @IsString()
  @Length(3, 20)
  @Field(() => String, { nullable: true })
  memberNick?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberFullName?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberImage?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberAddress?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memberDesc?: string;

  @IsOptional()
  @IsEnum(SubscriptionTier)
  @Field(() => SubscriptionTier, { nullable: true })
  subscriptionTier?: SubscriptionTier;
}