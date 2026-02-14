import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MeomulBatchModule } from './meomul-batch.module';

async function bootstrap() {
	const logger = new Logger('MeomulBatch');
	const app = await NestFactory.create(MeomulBatchModule);
	const port = process.env.PORT_BATCH ?? 3003;
	await app.listen(port);
	logger.log(`Meomul Batch server running on port ${port}`);
}
bootstrap();
