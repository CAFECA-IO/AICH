import { Injectable } from '@nestjs/common';
// import { CreateAuditReportDto } from './dto/create-audit_report.dto';
import { generateReport } from '@/libs/lang_chain/report';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ConfigService } from '@nestjs/config';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
// import { UpdateAuditReportDto } from './dto/update-audit_report.dto';

@Injectable()
export class AuditReportService {
  private readonly nomicEmbedding: OllamaEmbeddings;
  private readonly chatOllama: ChatOllama;
  constructor(private configService: ConfigService) {}

  async create(input: string) {
    const answer = await generateReport(input);
    return answer;
  }

  // findAll() {
  //   return `This action returns all auditReport`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} auditReport`;
  // }

  // update(id: number, updateAuditReportDto: UpdateAuditReportDto) {
  //   return `This action updates a #${id} auditReport`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} auditReport`;
  // }
}
