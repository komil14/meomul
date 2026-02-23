import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { MemberJwtPayload } from '../../../libs/types/member';

export const CurrentMember = createParamDecorator((_: unknown, context: ExecutionContext) => {
	const gqlContext = GqlExecutionContext.create(context);
	const graphContext = gqlContext.getContext<{ req?: { member?: MemberJwtPayload } }>();
	return graphContext.req?.member;
});
