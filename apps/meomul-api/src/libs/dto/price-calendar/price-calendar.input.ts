import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, Matches } from 'class-validator';

@InputType()
export class PriceCalendarInput {
	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	roomId: string;

	@IsOptional()
	@IsString()
	@Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be in YYYY-MM format' })
	@Field(() => String, { nullable: true })
	month?: string; // YYYY-MM format
}
