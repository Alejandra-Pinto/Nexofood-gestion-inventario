import { Test, TestingModule } from '@nestjs/testing';
import { QueriesReportsService } from './queries-reports.service';

describe('QueriesReportsService', () => {
  let service: QueriesReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueriesReportsService],
    }).compile();

    service = module.get<QueriesReportsService>(QueriesReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
