import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcrModule } from './ocr/ocr.module';
import { LruCacheModule } from './lru_cache/lru_cache.module';

@Module({
  imports: [OcrModule, LruCacheModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
