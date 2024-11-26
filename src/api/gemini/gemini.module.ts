import { Module } from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { LruCacheModule } from '@/libs/lru_cache/lru_cache.module';
import { ConfigModule } from '@nestjs/config';
import { RepositoriesModule } from '@/api/repository/repositories.module';

@Module({
  imports: [
    ConfigModule,
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
    RepositoriesModule,
  ],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
