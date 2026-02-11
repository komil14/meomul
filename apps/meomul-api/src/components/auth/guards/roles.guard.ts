import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Messages } from '../../../libs/messages';
import { MemberType } from '../../../libs/enums/member.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	public canActivate(context: ExecutionContext): boolean {
		const roles = this.reflector.getAllAndOverride<MemberType[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);

		if (!roles || roles.length === 0) {
			return true;
		}

		const gqlContext = GqlExecutionContext.create(context);
		const member = gqlContext.getContext().req?.member;

		if (!member) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		if (!roles.includes(member.memberType)) {
			throw new ForbiddenException(Messages.ONLY_SPECIFIC_ROLES_ALLOWED);
		}

		return true;
	}
}
