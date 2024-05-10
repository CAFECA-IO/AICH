import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { LlamaModule } from 'src/llama/llama.module';
import { GoogleVisionModule } from 'src/google_vision/google_vision.module';
import { OcrController } from './ocr.controller';
import {
  AccountInvoiceData,
  cleanInvoiceData,
} from 'src/common/interfaces/account';
import { invoice_modelfile } from 'src/constants/modelfiles/invoice_modelfile';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';
import { LangChainModule } from 'src/lang-chain/lang-chain.module';

@Module({
  imports: [
    GoogleVisionModule,
    LlamaModule.forRoot<AccountInvoiceData>({
      modelName: 'llama_account_invoice',
      modelfile: invoice_modelfile,
      typeCleaner: cleanInvoiceData,
      retryLimit: 10,
    }),
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
    LangChainModule,
  ],
  providers: [OcrService],
  controllers: [OcrController],
})
export class OcrModule {}
