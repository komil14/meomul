import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Message } from '../../../libs/enums/common';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly authService: AuthService,
	) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) {
			return true;
		}

		const gqlContext = GqlExecutionContext.create(context);
		const req = gqlContext.getContext().req;
		const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization;

		if (!authHeader || typeof authHeader !== 'string') {
			throw new UnauthorizedException(Message.TOKEN_NOT_EXIST);
		}

		const [type, token] = authHeader.split(' ');
		if (type !== 'Bearer' || !token) {
			throw new UnauthorizedException(Message.TOKEN_NOT_EXIST);
		}

		const member = await this.authService.verifyToken(token);
		req.member = member;

		return true;
	}
}
