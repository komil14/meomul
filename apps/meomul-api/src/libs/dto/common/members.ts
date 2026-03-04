import { Field, Int, ObjectType } from '@nestjs/graphql';
import { MemberDto } from '../member/member';
import { MetaCounterDto } from './pagination';

@ObjectType()
export class MemberTypeCounts {
	@Field(() => Int)
	USER: number;

	@Field(() => Int)
	AGENT: number;

	@Field(() => Int)
	ADMIN: number;

	@Field(() => Int)
	ADMIN_OPERATOR: number;
}

@ObjectType()
export class MembersDto {
	@Field(() => [MemberDto])
	list: MemberDto[];

	@Field(() => MetaCounterDto)
	metaCounter: MetaCounterDto;

	@Field(() => MemberTypeCounts, { nullable: true })
	typeCounts?: MemberTypeCounts;
}
