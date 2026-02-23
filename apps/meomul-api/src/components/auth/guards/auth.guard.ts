import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { Messages } from '../../../libs/messages';
import type { MemberJwtPayload } from '../../../libs/types/member';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

type AuthenticatedRequest = Request & { member?: MemberJwtPayload | null };

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

		const req =
			context.getType<'graphql' | 'http'>() === 'graphql'
				? GqlExecutionContext.create(context).getContext<{ req?: AuthenticatedRequest }>().req
				: context.switchToHttp().getRequest<AuthenticatedRequest>();
		if (!req) {
			if (isPublic) {
				return true;
			}
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const authorizationHeader = req.headers.authorization;
		const authHeader =
			typeof authorizationHeader === 'string'
				? authorizationHeader
				: Array.isArray(authorizationHeader)
					? authorizationHeader[0]
					: undefined;

		// If public route, try to extract user if token exists, but don't fail if it doesn't
		if (isPublic) {
			if (authHeader && typeof authHeader === 'string') {
				const [type, token] = authHeader.split(' ');
				if (type === 'Bearer' && token) {
					try {
						const member = await this.authService.verifyToken(token);
						req.member = member;
					} catch {
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
