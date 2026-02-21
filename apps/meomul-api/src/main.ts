import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);

	// CORS — allow frontend dev server and production domain
	app.enableCors({
		origin: [
			'http://localhost:3000',
			'http://localhost:3001',
			process.env.FRONTEND_URL ?? '',
		].filter(Boolean),
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

	await app.listen(process.env.PORT_API ?? 3001);
}
bootstrap();
