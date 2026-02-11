import { Controller, Get } from '@nestjs/common';
import { MeomulBatchService } from './meomul-batch.service';

@Controller()
export class MeomulBatchController {
  constructor(private readonly meomulBatchService: MeomulBatchService) {}

  @Get()
  getHello(): string {
    return this.meomulBatchService.getHello();
  }
}
