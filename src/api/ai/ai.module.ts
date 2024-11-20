import { Module } from '@nestjs/common';
import { AIService } from '@/api/ai/ai.service';
import { AIController } from '@/api/ai/ai.controller';
import { GeminiModule } from '@/api/gemini/gemini.module';

@Module({
  imports: [GeminiModule],
  controllers: [AIController],
  providers: [AIService],
})
export class AiModule {}
