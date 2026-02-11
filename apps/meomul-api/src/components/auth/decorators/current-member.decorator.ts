import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentMember = createParamDecorator((_: unknown, context: ExecutionContext) => {
	const gqlContext = GqlExecutionContext.create(context);
	return gqlContext.getContext().req?.member;
});
