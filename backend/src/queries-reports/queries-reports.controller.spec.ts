import { Test, TestingModule } from '@nestjs/testing';
import { QueriesReportsController } from './queries-reports.controller';

describe('QueriesReportsController', () => {
  let controller: QueriesReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueriesReportsController],
    }).compile();

    controller = module.get<QueriesReportsController>(QueriesReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
