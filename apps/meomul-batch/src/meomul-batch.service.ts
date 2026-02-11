import { Injectable } from '@nestjs/common';

@Injectable()
export class MeomulBatchService {
  getHello(): string {
    return 'Welcome to Meomul Batch server!';
  }
}
