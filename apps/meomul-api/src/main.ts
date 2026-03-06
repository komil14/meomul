import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './socket/redis-io.adapter';

async function bootstrap() {
	const logger = new Logger('Bootstrap');
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	const isProduction = process.env.NODE_ENV === 'production';

	// Security headers
	app.use(
		helmet({
			contentSecurityPolicy: isProduction ? undefined : false,
			crossOriginEmbedderPolicy: false,
		}),
	);

	// Response compression
	app.use(compression());

	// Cookie parser for httpOnly refresh-token cookies
	const cookieSecret = process.env.COOKIE_SECRET;
	if (isProduction && !cookieSecret) {
		throw new Error('COOKIE_SECRET environment variable is required in production.');
	}
	app.use(cookieParser(cookieSecret ?? 'dev_cookie_secret'));

	// Request body size limit
	app.use(require('express').json({ limit: '1mb' }));

	// CORS — restrict localhost origins to development only
	const frontendUrl = process.env.FRONTEND_URL;
	if (isProduction && !frontendUrl) {
		throw new Error('FRONTEND_URL environment variable is required in production for CORS.');
	}
	const corsOrigins: string[] = [
		...(isProduction ? [] : ['http://localhost:3000', 'http://localhost:3001']),
		frontendUrl ?? '',
	].filter(Boolean);

	app.enableCors({
		origin: corsOrigins,
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

	// Graceful shutdown hooks (always enabled, not just for Redis)
	app.enableShutdownHooks();

	// Optional horizontal scaling for websocket gateways.
	const redisUrl = process.env.REDIS_URL?.trim();
	const redisSocketEnabled = process.env.REDIS_SOCKET_ENABLED !== 'false';
	if (redisUrl && redisSocketEnabled) {
		const redisIoAdapter = new RedisIoAdapter(app);
		try {
			await redisIoAdapter.connectToRedis(redisUrl);
			app.useWebSocketAdapter(redisIoAdapter);
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
