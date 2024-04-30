import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlamaService } from './llama.service';
import { LlamaServiceOptions } from 'src/common/interfaces/llama';

/* Info Murky(20240429): Factory provider for LlamaService
 * Example:
 *import { Module } from '@nestjs/common';
 *import { LlamaModule } from 'src/llama/llama.module';
 *import { OcrService } from './ocr.service';
 * @Module({
 *   imports: [
 *     LlamaModule.forRoot<AccountInvoiceData>({
 *       modelName: 'llama_account_invoice',
 *       modelfile: invoice_modelfile,
 *       typeCleaner: cleanInvoiceData,
 *     }),
 *   ],
 *   providers: [OcrService],
 * })
 * export class OcrModule {}
 */

@Module({
  imports: [ConfigModule],
})
export class LlamaModule {
  static forRoot<T>(options: LlamaServiceOptions<T>): DynamicModule {
    return {
      module: LlamaModule,
      providers: [
        {
          provide: 'LLAMA_SERVICE_OPTIONS',
          useValue: options,
        },
        {
          provide: LlamaService,
          useClass: LlamaService,
        },
      ],
      exports: [LlamaService],
    };
  }
}
