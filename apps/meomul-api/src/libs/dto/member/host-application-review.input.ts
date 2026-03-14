import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { HostApplicationStatus } from '../../enums/member.enum';

@InputType()
export class HostApplicationReviewInput {
	@IsString()
	@Field(() => String)
	applicationId: string;

	@IsEnum(HostApplicationStatus)
	@Field(() => HostApplicationStatus)
	status: HostApplicationStatus;

	@IsOptional()
	@IsString()
	@Length(0, 1000)
	@Field(() => String, { nullable: true })
	reviewNote?: string;
}
