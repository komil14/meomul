import { NestFactory } from '@nestjs/core';
import { MeomulBatchModule } from './meomul-batch.module';

async function bootstrap() {
  const app = await NestFactory.create(MeomulBatchModule);
  await app.listen(process.env.PORT_BATCH ?? 3000);
}
bootstrap();
