import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { Messages } from '../../libs/messages';

@Injectable()
export class UploadGuard implements CanActivate {
	constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest();
		const authHeader = req.headers.authorization;

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
