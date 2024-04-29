import { Module } from '@nestjs/common';
import { LlamaService } from './llama.service';

@Module({
  providers: [LlamaService]
})
export class LlamaModule {}
