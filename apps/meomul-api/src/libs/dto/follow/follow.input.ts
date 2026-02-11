import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString } from 'class-validator';

@InputType()
export class FollowInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  followingId: string;
}