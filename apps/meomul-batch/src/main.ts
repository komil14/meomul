import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MeomulBatchModule } from './meomul-batch.module';

async function bootstrap() {
	const logger = new Logger('MeomulBatch');
	const app = await NestFactory.createApplicationContext(MeomulBatchModule);
	app.enableShutdownHooks();
	logger.log('Meomul Batch worker initialized (scheduler active)');

	const shutdown = async (signal: string) => {
		logger.log(`Received ${signal}, shutting down batch worker...`);
		await app.close();
		process.exit(0);
	};

	process.on('SIGINT', () => {
		void shutdown('SIGINT');
	});
	process.on('SIGTERM', () => {
		void shutdown('SIGTERM');
	});
}
void bootstrap();
