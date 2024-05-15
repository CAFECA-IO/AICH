import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlamaService } from '@/llama/llama.service';
import { LlamaServiceOptions } from '@/common/interfaces/llama';

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
