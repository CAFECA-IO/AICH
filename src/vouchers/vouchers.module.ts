import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';

import { LangChainModule } from 'src/lang_chain/lang_chain.module';
import {
  functionCall,
  functions,
  prompt,
} from 'src/constants/lang_chain_template/voucher';

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
