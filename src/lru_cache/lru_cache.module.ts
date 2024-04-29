import { Module } from '@nestjs/common';
import { LruCacheService } from './lru_cache.service';

@Module({
  providers: [LruCacheService]
})
export class LruCacheModule {}
