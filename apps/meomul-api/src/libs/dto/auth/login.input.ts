import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, Length } from 'class-validator';

@InputType()
export class LoginInput {
  @IsNotEmpty()
  @IsString()
  @Length(3, 20)
  @Field(() => String)
  memberNick: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 100)
  @Field(() => String)
  memberPassword: string;
}