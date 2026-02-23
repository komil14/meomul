import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import JobLockSchema from './job-lock.schema';
import { CronLockService } from './cron-lock.service';

@Global()
@Module({
	imports: [MongooseModule.forFeature([{ name: 'JobLock', schema: JobLockSchema }])],
	providers: [CronLockService],
	exports: [CronLockService],
})
export class CommonModule {}
