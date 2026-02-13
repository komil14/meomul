import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsNumber, Min, Max } from 'class-validator';

@InputType()
export class FollowInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  followingId: string;
}

@InputType()
export class FollowInquiry {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Field(() => Int, { defaultValue: 1 })
  page: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Field(() => Int, { defaultValue: 20 })
  limit: number;
}