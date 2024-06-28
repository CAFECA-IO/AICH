// rag.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { RagService } from '@/api/rag/rag.service';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('generate-report')
  async generateReport(@Body('question') question: string): Promise<any> {
    const answer = await this.ragService.generateReport(question);
    return { answer };
  }
}
