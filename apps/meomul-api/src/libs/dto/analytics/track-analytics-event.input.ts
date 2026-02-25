import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class TrackAnalyticsEventInput {
	@IsNotEmpty()
	@IsString()
	@MaxLength(120)
	@Field(() => String)
	eventName: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	@Field(() => String, { nullable: true })
	eventPath?: string;

	@IsOptional()
	@IsString()
	@MaxLength(8000)
	@Field(() => String, { nullable: true })
	payload?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Field(() => String, { nullable: true })
	source?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	@Field(() => String, { nullable: true })
	userAgent?: string;
}
