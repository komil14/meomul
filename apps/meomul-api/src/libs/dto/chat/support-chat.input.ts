import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

@InputType()
export class StartSupportChatInput {
	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	bookingId?: string;

	@IsOptional()
	@IsString()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	topic?: string;

	@IsOptional()
	@IsString()
	@Length(1, 200)
	@Field(() => String, { nullable: true })
	sourcePath?: string;

	@IsNotEmpty()
	@IsString()
	@Length(1, 500)
	@Field(() => String)
	initialMessage: string;
}
