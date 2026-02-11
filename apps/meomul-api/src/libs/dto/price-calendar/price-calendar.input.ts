import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

@InputType()
export class PriceCalendarInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  roomId: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  month?: string; // YYYY-MM format
}