import { Module } from '@nestjs/common';
import { OllamaService } from '@/api/ollama/ollama.service';

@Module({
  providers: [OllamaService],
  exports: [OllamaService],
})
export class OllamaModule {}
