import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

@InputType()
export class ResetPasswordInput {
	@IsNotEmpty()
	@IsString()
	@Length(3, 20)
	@Field(() => String)
	memberNick: string;

	@IsNotEmpty()
	@IsString()
	@Matches(/^01[0-9]{8,9}$/, { message: 'Invalid Korean phone number format' })
	@Field(() => String)
	memberPhone: string;

	@IsNotEmpty()
	@IsString()
	@Length(6, 100)
	@Field(() => String)
	newPassword: string;
}
