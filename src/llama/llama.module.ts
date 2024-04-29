import { Module } from '@nestjs/common';
import { LlamaService } from './llama.service';

@Module({
  providers: [LlamaService],
  exports: [LlamaService],
})
export class LlamaModule {}
