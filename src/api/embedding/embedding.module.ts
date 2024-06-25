import { Module } from '@nestjs/common';
import { EmbeddingService } from '@/api/embedding/embedding.service';
import { EmbeddingController } from '@/api/embedding/embedding.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [EmbeddingController],
  providers: [EmbeddingService],
})
export class EmbeddingModule {}
