import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MemberType } from '../../enums/member.enum';

@InputType()
export class AnalyticsEventSearchInput {
	@IsOptional()
	@IsString()
	@MaxLength(120)
	@Field(() => String, { nullable: true })
	eventName?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Field(() => String, { nullable: true })
	memberId?: string;

	@IsOptional()
	@IsEnum(MemberType)
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Field(() => String, { nullable: true })
	source?: string;

	@IsOptional()
	@IsString()
	@MaxLength(30)
	@Field(() => String, { nullable: true })
	fromDate?: string;

	@IsOptional()
	@IsString()
	@MaxLength(30)
	@Field(() => String, { nullable: true })
	toDate?: string;
}
