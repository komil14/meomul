import { Module } from '@nestjs/common';
import { MeomulBatchController } from './meomul-batch.controller';
import { MeomulBatchService } from './meomul-batch.service';

@Module({
  imports: [],
  controllers: [MeomulBatchController],
  providers: [MeomulBatchService],
})
export class MeomulBatchModule {}
