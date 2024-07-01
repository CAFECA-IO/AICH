import { Module } from '@nestjs/common';
import { QdrantService } from '@/api/qdrant/qdrant.service';
import { FileProcessModule } from '@/api/file_process/file_process.module';
import { OllamaModule } from '@/api/ollama/ollama.module';

@Module({
  imports: [FileProcessModule, OllamaModule], // 導入文件處理模組, Ollama模組
  providers: [QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}
