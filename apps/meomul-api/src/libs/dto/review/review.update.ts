import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

@InputType()
export class ReviewUpdate {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  _id: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  reviewTitle?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  reviewText?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  reviewStatus?: string;
}