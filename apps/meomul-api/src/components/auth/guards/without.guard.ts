import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { IncomingHttpHeaders } from 'http';
import type { MemberJwtPayload } from '../../../libs/types/member';
import { AuthService } from '../auth.service';

type WithoutGuardRequest = {
	headers: IncomingHttpHeaders;
	body?: { authMember?: MemberJwtPayload | null };
};

@Injectable()
export class WithoutGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		console.info('--- @guard() Authentication [WithoutGuard] ---');

		const gqlContext = GqlExecutionContext.create(context);
		const req = gqlContext.getContext<{ req: WithoutGuardRequest }>().req;

		if (!req.body) {
			req.body = {};
		}

		const authorizationHeader = req.headers.authorization;
		const bearerToken =
			typeof authorizationHeader === 'string'
				? authorizationHeader
				: Array.isArray(authorizationHeader)
					? authorizationHeader[0]
					: undefined;
		if (bearerToken) {
			try {
				const token = bearerToken.split(' ')[1] ?? '';
				req.body.authMember = token ? await this.authService.verifyToken(token) : null;
			} catch {
				req.body.authMember = null;
			}
		} else {
			req.body.authMember = null;
		}

		console.log('memberNick[without] =>', req.body.authMember?.memberNick ?? 'none');
		return true;
	}
}
