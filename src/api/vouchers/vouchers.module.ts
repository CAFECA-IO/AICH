import { Module } from '@nestjs/common';
import { VouchersController } from '@/api/vouchers/vouchers.controller';
import { VouchersService } from '@/api/vouchers/vouchers.service';
import { LruCacheModule } from '@/libs/lru_cache/lru_cache.module';

import { LangChainModule } from '@/libs/lang_chain/lang_chain.module';
import {
  VOUCHER_LANGCHAIN_FUNCTION_CALL,
  VOUCHER_RETURN_JSON_TEMPLATE,
  VOUCHER_LANGCHAIN_PROMPT_TEMPLATE,
} from '@/constants/lang_chain_template/voucher';

@Module({
  imports: [
    LangChainModule.forRoot({
      moduleName: 'VouchersModule',
      functionCallOption: VOUCHER_LANGCHAIN_FUNCTION_CALL,
      functions: VOUCHER_RETURN_JSON_TEMPLATE,
      prompt: VOUCHER_LANGCHAIN_PROMPT_TEMPLATE,
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
