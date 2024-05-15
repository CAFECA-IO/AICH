import { Test, TestingModule } from '@nestjs/testing';
import { LruCacheService } from '@/lru_cache/lru_cache.service';

describe('LruCacheService', () => {
  let service: LruCacheService<string>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LruCacheService],
    }).compile();

    service = module.get<LruCacheService<string>>(LruCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
