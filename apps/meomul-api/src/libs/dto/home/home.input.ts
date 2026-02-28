import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

@InputType()
export class HomeFeedInput {
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	@Field(() => Int, { nullable: true, defaultValue: 5 })
	heroLimit?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(30)
	@Field(() => Int, { nullable: true, defaultValue: 10 })
	trendingLimit?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	@Field(() => Int, { nullable: true, defaultValue: 8 })
	dealsLimit?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	@Field(() => Int, { nullable: true, defaultValue: 6 })
	testimonialsLimit?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(12)
	@Field(() => Int, { nullable: true, defaultValue: 5 })
	featuredReviewLimit?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	@Field(() => Int, { nullable: true, defaultValue: 6 })
	recommendationLimit?: number;
}
