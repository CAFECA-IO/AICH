import { DynamicModule, Module } from '@nestjs/common';
import { LangChainService } from './lang_chain.service';
import { LangChainServiceOption } from 'src/common/interfaces/lang_chain';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [LangChainService],
})
export class LangChainModule {
  static forRoot(options: LangChainServiceOption): DynamicModule {
    return {
      module: LangChainModule,
      providers: [
        {
          provide: 'LANG_CHAIN_SERVICE_OPTIONS',
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
