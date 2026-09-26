import { Test, TestingModule } from '@nestjs/testing';
import { KitchenService } from './kitchen.service';

describe('KitchenService', () => {
  let service: KitchenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KitchenService],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
