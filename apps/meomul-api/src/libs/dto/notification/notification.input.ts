import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '../../enums/common.enum';

@InputType()
export class NotificationInput {
  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  userId: string;

  @IsNotEmpty()
  @IsEnum(NotificationType)
  @Field(() => NotificationType)
  type: NotificationType;

  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  title: string;

  @IsNotEmpty()
  @IsString()
  @Field(() => String)
  message: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  link?: string;
}