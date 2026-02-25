import { Field, ObjectType } from '@nestjs/graphql';
import { MemberType } from '../../enums/member.enum';

@ObjectType()
export class AnalyticsEventDto {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	memberId: string;

	@Field(() => MemberType)
	memberType: MemberType;

	@Field(() => String)
	eventName: string;

	@Field(() => String, { nullable: true })
	eventPath?: string;

	@Field(() => String, { nullable: true })
	payload?: string;

	@Field(() => String, { nullable: true })
	source?: string;

	@Field(() => String, { nullable: true })
	userAgent?: string;

	@Field(() => Date)
	createdAt: Date;
}
