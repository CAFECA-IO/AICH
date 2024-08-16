import { Module } from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { GeminiController } from '@/api/gemini/gemini.controller';
import { ConfigModule } from '@nestjs/config';
import { LruCacheModule } from '@/libs/lru_cache/lru_cache.module';
@Module({
  imports: [
    ConfigModule,
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}
