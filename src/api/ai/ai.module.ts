import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { GeminiService } from '../gemini/gemini.service';

@Module({
  imports: [],
  controllers: [AIController],
  providers: [AIService, GeminiService],
})
export class AiModule {}
