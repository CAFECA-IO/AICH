import { Module } from '@nestjs/common';
import { VouchersController } from '@/vouchers/vouchers.controller';
import { VouchersService } from '@/vouchers/vouchers.service';
import { LruCacheModule } from '@/lru_cache/lru_cache.module';

import { LangChainModule } from '@/lang_chain/lang_chain.module';
import {
  functionCall,
  functions,
  prompt,
} from '@/constants/lang_chain_template/voucher';

@Module({
  imports: [
    LangChainModule.forRoot({
      moduleName: 'VouchersModule',
      functionCallOption: functionCall,
      functions: functions,
      prompt: prompt,
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
