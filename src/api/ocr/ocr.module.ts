import { Module } from '@nestjs/common';
import { OcrService } from '@/api/ocr/ocr.service';
import { GoogleVisionModule } from '@/libs/google_vision/google_vision.module';
import { OcrController } from '@/api/ocr/ocr.controller';
import { LruCacheModule } from '@/libs/lru_cache/lru_cache.module';
import { LangChainModule } from '@/libs/lang_chain/lang_chain.module';
import {
  OCR_FUNCTION_CALL,
  OCR_RETURN_JSON_SCHEMA,
  OCR_LANGCHAIN_PROMPT_TEMPLATE,
  OCR_OLLAMA_PARAMS,
} from '@/constants/lang_chain_template/ocr';

@Module({
  imports: [
    GoogleVisionModule,
    LangChainModule.forRoot({
      moduleName: 'OcrModule',
      functionCallOption: OCR_FUNCTION_CALL,
      functions: OCR_RETURN_JSON_SCHEMA,
      prompt: OCR_LANGCHAIN_PROMPT_TEMPLATE,
      ollamaParams: OCR_OLLAMA_PARAMS,
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
