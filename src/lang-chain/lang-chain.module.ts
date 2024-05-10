import { Module } from '@nestjs/common';
import { LangChainService } from './lang-chain.service';
import { LangChainController } from './lang-chain.controller';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';

@Module({
  imports: [
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  controllers: [LangChainController],
  providers: [LangChainService],
  exports: [LangChainService],
})
export class LangChainModule {}
