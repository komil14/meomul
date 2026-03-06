import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional, Length } from 'class-validator';
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
	@Length(1, 200)
	@Field(() => String)
	title: string;

	@IsNotEmpty()
	@IsString()
	@Length(1, 2000)
	@Field(() => String)
	message: string;

	@IsOptional()
	@IsString()
	@Length(0, 500)
	@Field(() => String, { nullable: true })
	link?: string;
}
