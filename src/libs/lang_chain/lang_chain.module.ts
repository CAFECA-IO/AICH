import { DynamicModule, Module } from '@nestjs/common';
import { LangChainService } from '@/libs/lang_chain/lang_chain.service';
import { LangChainServiceOption } from '@/interfaces/lang_chain';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
})
export class LangChainModule {
  static forRoot(options: LangChainServiceOption): DynamicModule {
    return {
      module: LangChainModule,
      providers: [
        {
          provide: 'LANGCHAIN_OPTIONS',
          useValue: options,
        },
        {
          provide: LangChainService,
          useClass: LangChainService,
        },
      ],
      exports: [LangChainService],
    };
  }
}
