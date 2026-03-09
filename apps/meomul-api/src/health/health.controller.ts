import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from '../components/auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
	constructor(@InjectConnection() private readonly connection: Connection) {}

	@Get()
	@Public()
	check(): { status: string; db: string; ts: string } {
		const dbReady = this.connection.readyState === 1;
		if (!dbReady) {
			throw new ServiceUnavailableException('DB not ready');
		}
		return { status: 'ok', db: 'connected', ts: new Date().toISOString() };
	}
}
