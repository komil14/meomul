import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './socket/redis-io.adapter';

async function bootstrap() {
	const logger = new Logger('Bootstrap');
	const app = await NestFactory.create<NestExpressApplication>(AppModule);

	// CORS — allow frontend dev server and production domain
	app.enableCors({
		origin: ['http://localhost:3000', 'http://localhost:3001', process.env.FRONTEND_URL ?? ''].filter(Boolean),
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	});

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	// Serve static files — accessible at http://localhost:3001/uploads/<target>/<filename>
	app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads' });

	// Optional horizontal scaling for websocket gateways.
	const redisUrl = process.env.REDIS_URL?.trim();
	const redisSocketEnabled = process.env.REDIS_SOCKET_ENABLED !== 'false';
	if (redisUrl && redisSocketEnabled) {
		const redisIoAdapter = new RedisIoAdapter(app);
		try {
			await redisIoAdapter.connectToRedis(redisUrl);
			app.useWebSocketAdapter(redisIoAdapter);
			app.enableShutdownHooks();
			process.on('beforeExit', () => {
				void redisIoAdapter.closeRedisConnections();
			});
		} catch (error) {
			logger.error('Failed to initialize Socket.IO Redis adapter; falling back to in-memory adapter', error);
		}
	}

	await app.listen(process.env.PORT_API ?? 3001);
}
void bootstrap();
