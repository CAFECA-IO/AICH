import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlamaService } from './llama.service';
import { LlamaServiceOptions } from 'src/common/interfaces/llama';

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
