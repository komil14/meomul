import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	// Serve static files from /uploads — accessible at http://localhost:3000/uploads/<target>/<filename>
	app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads' });

	await app.listen(process.env.PORT_API ?? 3000);
}
bootstrap();
