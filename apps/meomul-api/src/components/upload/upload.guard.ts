import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';

type UploadRequest = Request & { member?: MemberJwtPayload };

@Injectable()
export class UploadGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<UploadRequest>();
		const authorizationHeader = req.headers.authorization;
		const authHeader =
			typeof authorizationHeader === 'string'
				? authorizationHeader
				: Array.isArray(authorizationHeader)
					? authorizationHeader[0]
					: undefined;

		if (!authHeader || typeof authHeader !== 'string') {
			throw new UnauthorizedException(Messages.TOKEN_NOT_EXIST);
		}

		const [type, token] = authHeader.split(' ');
		if (type !== 'Bearer' || !token) {
			throw new UnauthorizedException(Messages.TOKEN_NOT_EXIST);
		}

		req.member = await this.authService.verifyToken(token);
		return true;
	}
}
