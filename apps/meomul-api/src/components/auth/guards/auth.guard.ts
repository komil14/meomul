import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Messages } from '../../../libs/messages';
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

		const gqlContext = GqlExecutionContext.create(context);
		const req = gqlContext.getContext().req;
		const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization;

		// If public route, try to extract user if token exists, but don't fail if it doesn't
		if (isPublic) {
			if (authHeader && typeof authHeader === 'string') {
				const [type, token] = authHeader.split(' ');
				if (type === 'Bearer' && token) {
					try {
						const member = await this.authService.verifyToken(token);
						req.member = member;
					} catch (error) {
						// Invalid token on public route - just continue without user
						req.member = null;
					}
				}
			}
			return true;
		}

		// Protected route - require valid token
		if (!authHeader || typeof authHeader !== 'string') {
			throw new UnauthorizedException(Messages.TOKEN_NOT_EXIST);
		}

		const [type, token] = authHeader.split(' ');
		if (type !== 'Bearer' || !token) {
			throw new UnauthorizedException(Messages.TOKEN_NOT_EXIST);
		}

		const member = await this.authService.verifyToken(token);
		req.member = member;

		return true;
	}
}
