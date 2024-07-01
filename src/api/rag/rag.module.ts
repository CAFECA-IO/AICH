// rag.module.ts
import { Module } from '@nestjs/common';
import { RagService } from '@/api/rag/rag.service';
import { QdrantModule } from '@/api/qdrant/qdrant.module';
import { OllamaModule } from '@/api/ollama/ollama.module';
import { RagController } from '@/api/rag/rag.controller';

@Module({
  imports: [QdrantModule, OllamaModule],
  providers: [RagService],
  exports: [RagService],
  controllers: [RagController],
})
export class RagModule {}
