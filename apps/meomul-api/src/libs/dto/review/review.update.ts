import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

@InputType()
export class ReviewUpdate {
	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	_id: string;

	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(5)
	@Field(() => Int, { nullable: true })
	overallRating?: number;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	reviewTitle?: string;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	reviewText?: string;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	reviewStatus?: string;
}
