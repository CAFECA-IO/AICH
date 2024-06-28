// rag.service.ts
import { Injectable } from '@nestjs/common';
import { QdrantService } from '@/api/qdrant/qdrant.service';
import { OllamaService } from '@/api/ollama/ollama.service';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { AUDIT_REPORT_TEMPLATE } from '@/constants/lang_chain_template/audit_report';

@Injectable()
export class RagService {
  constructor(
    private readonly qdrantService: QdrantService,
    private readonly ollamaService: OllamaService,
  ) {}

  async generateReport(question: string): Promise<string> {
    const prompt = ChatPromptTemplate.fromTemplate(AUDIT_REPORT_TEMPLATE);
    const retriever = await this.qdrantService.vectorStore.asRetriever();
    const documentChain = await createStuffDocumentsChain({
      llm: this.ollamaService.llama3,
      prompt,
    });
    const retrievalChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever,
    });
    const result = await retrievalChain.invoke({
      input: question,
    });
    const { answer } = result;
    return answer;
  }
}
