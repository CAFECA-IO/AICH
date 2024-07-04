// rag.controller.ts
import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import { RagService } from '@/api/rag/rag.service';
import { Response } from 'express';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('generate-report')
  async generateReport(@Body('question') question: string): Promise<any> {
    const answer = await this.ragService.generateReport(question);
    return { answer };
  }
  @Post('chat-with-history')
  async chatWithHistory(
    @Body('question') question: string,
    @Res() res: Response,
  ): Promise<any> {
    const stream = await this.ragService.chatWithHistory(question);
    for await (const chunk of stream) {
      try {
        const jsonString = JSON.stringify(chunk);
        const jsonData = JSON.parse(jsonString);
        if (jsonData.answer) {
          res.write(jsonData.answer);
        }
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    }

    res.end();
  }
}
