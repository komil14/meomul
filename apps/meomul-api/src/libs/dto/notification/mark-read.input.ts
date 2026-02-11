import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

@InputType()
export class MarkNotificationReadInput {
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  notificationId?: string;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  markAllAsRead?: boolean;
}