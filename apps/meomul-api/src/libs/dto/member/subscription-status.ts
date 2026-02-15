import { Field, ObjectType, Int } from '@nestjs/graphql';
import { SubscriptionTier } from '../../enums/member.enum';

@ObjectType()
export class SubscriptionStatusDto {
  @Field(() => SubscriptionTier)
  tier: SubscriptionTier;

  @Field(() => Boolean)
  active: boolean;

  @Field(() => Date, { nullable: true })
  expiresAt?: Date;

  @Field(() => Int, { nullable: true })
  daysRemaining?: number;
}
