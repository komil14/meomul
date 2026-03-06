import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type ms from 'ms';
import RefreshTokenSchema from '../../schemas/RefreshToken.model';
import { AuthService } from './auth.service';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'RefreshToken', schema: RefreshTokenSchema }]),
		JwtModule.registerAsync({
			useFactory: () => {
				const secret = process.env.JWT_SECRET;

				if (!secret) {
					if (process.env.NODE_ENV === 'development') {
						// eslint-disable-next-line no-console
						console.warn('[AuthModule] JWT_SECRET not set — using insecure dev secret. Do NOT use in production.');
					} else {
						throw new Error('JWT_SECRET environment variable is required. Set it before starting the server.');
					}
				}

				const expiresIn = (process.env.JWT_EXPIRES_IN?.trim() || '15m') as ms.StringValue;

				return {
					secret: secret ?? 'dev_jwt_secret_DO_NOT_USE_IN_PRODUCTION',
					signOptions: { expiresIn },
				};
			},
		}),
	],
	providers: [AuthService],
	exports: [AuthService],
})
export class AuthModule {}
