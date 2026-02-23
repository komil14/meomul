import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Module({
	imports: [
		JwtModule.registerAsync({
			useFactory: () => {
				const secret = process.env.JWT_SECRET;

				if (!secret && process.env.NODE_ENV === 'production') {
					throw new Error('JWT_SECRET is required in production');
				}

				return {
					secret: secret ?? 'dev_jwt_secret',
					signOptions: { expiresIn: '7d' },
				};
			},
		}),
	],
	providers: [AuthService],
	exports: [AuthService],
})
export class AuthModule {}
