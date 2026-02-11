import { Module } from '@nestjs/common';
import { MeomulBatchController } from './meomul-batch.controller';
import { MeomulBatchService } from './meomul-batch.service';
import {ConfigModule} from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [MeomulBatchController],
  providers: [MeomulBatchService],
})
export class MeomulBatchModule {}
