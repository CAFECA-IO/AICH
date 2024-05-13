import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { GoogleVisionModule } from 'src/google_vision/google_vision.module';
import { OcrController } from './ocr.controller';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';
import { LangChainModule } from 'src/lang_chain/lang_chain.module';
import {
  functionCall,
  functions,
  prompt,
} from 'src/constants/lang_chain_template/ocr';

@Module({
  imports: [
    GoogleVisionModule,
    LangChainModule.forRoot({
      moduleName: 'OcrModule',
      functionCallOption: functionCall,
      functions: functions,
      prompt: prompt,
    }),
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  providers: [OcrService],
  controllers: [OcrController],
})
export class OcrModule {}
