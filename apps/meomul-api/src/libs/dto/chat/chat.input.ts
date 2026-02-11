import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, Length } from 'class-validator';

@InputType()
export class StartChatInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  hotelId: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  bookingId?: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 500)
  @Field(() => String)
  initialMessage: string;
}