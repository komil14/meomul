import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

@InputType()
export class CreatePriceLockInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  roomId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Field(() => Int)
  currentPrice: number;
}