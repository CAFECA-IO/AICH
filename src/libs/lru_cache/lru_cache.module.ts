import { DynamicModule, Module } from '@nestjs/common';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { LruServiceOptions } from '@/interfaces/lru';

@Module({})
export class LruCacheModule {
  static forRoot<T>(options: LruServiceOptions): DynamicModule {
    return {
      module: LruCacheModule,
      providers: [
        {
          provide: 'LRU_SERVICE_OPTIONS',
          useValue: options,
        },
        {
          provide: LruCacheService,
          useClass: LruCacheService<T>,
        },
      ],
      exports: [LruCacheService],
    };
  }
}
