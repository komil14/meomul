import { Test, TestingModule } from '@nestjs/testing';
import { MeomulBatchController } from './meomul-batch.controller';
import { MeomulBatchService } from './meomul-batch.service';

describe('MeomulBatchController', () => {
  let meomulBatchController: MeomulBatchController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MeomulBatchController],
      providers: [MeomulBatchService],
    }).compile();

    meomulBatchController = app.get<MeomulBatchController>(MeomulBatchController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(meomulBatchController.getHello()).toBe('Hello World!');
    });
  });
});
