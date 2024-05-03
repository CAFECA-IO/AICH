import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { LlamaModule } from 'src/llama/llama.module';
import {
  AccountLineItem,
  cleanAccountLineItems,
} from 'src/common/interfaces/account';
import { voucher_modelfile } from 'src/constants/modelfiles/voucher_modelfile';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';

@Module({
  imports: [
    LlamaModule.forRoot<AccountLineItem[]>({
      modelName: 'llama_account_voucher',
      modelfile: voucher_modelfile,
      typeCleaner: cleanAccountLineItems,
      retryLimit: 10,
    }),
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  controllers: [VouchersController],
  providers: [VouchersService],
})
export class VouchersModule {}
