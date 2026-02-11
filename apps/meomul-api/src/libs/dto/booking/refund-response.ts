import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class RefundResponseDto {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  message: string;

  @Field(() => Int)
  refundAmount: number;

  @Field(() => String, { nullable: true })
  bookingId?: string;
}