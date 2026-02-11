import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional, Length } from 'class-validator';
import { MessageType } from '../../enums/common.enum';

@InputType()
export class SendMessageInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  chatId: string;

  @IsNotEmpty()
  @IsEnum(MessageType)
  @Field(() => MessageType)
  messageType: MessageType;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  @Field(() => String, { nullable: true })
  content?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  fileUrl?: string;
}