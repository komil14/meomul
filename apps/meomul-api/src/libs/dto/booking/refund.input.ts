import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsArray, Length } from 'class-validator';

@InputType()
export class RequestRefundInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  bookingId: string;

  @IsNotEmpty()
  @IsString()
  @Length(10, 500)
  @Field(() => String)
  reason: string;

  @IsOptional()
  @IsArray()
  @Field(() => [String], { nullable: true })
  evidencePhotos?: string[]; // URLs to uploaded evidence photos
}