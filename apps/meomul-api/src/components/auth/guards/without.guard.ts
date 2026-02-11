import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from '../auth.service';

@Injectable()
export class WithoutGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		console.info('--- @guard() Authentication [WithoutGuard] ---');

		const gqlContext = GqlExecutionContext.create(context);
		const req = gqlContext.getContext().req;

		if (!req?.body) {
			req.body = {};
		}

		const bearerToken = req?.headers?.authorization;
		if (bearerToken) {
			try {
				const token = bearerToken.split(' ')[1];
				const authMember = await this.authService.verifyToken(token);
				req.body.authMember = authMember;
			} catch (err) {
				req.body.authMember = null;
			}
		} else {
			req.body.authMember = null;
		}

		console.log('memberNick[without] =>', req.body.authMember?.memberNick ?? 'none');
		return true;
	}
}
