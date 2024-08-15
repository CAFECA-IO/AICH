import { Injectable } from '@nestjs/common';
import { QdrantService } from '@/api/qdrant/qdrant.service';
import { OllamaService } from '@/api/ollama/ollama.service';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { AUDIT_REPORT_TEMPLATE } from '@/constants/lang_chain_template/audit_report';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  HISTORY_AWARE_PROMPT,
  HISTORY_AWARE_RETRIEVAL_PROMPT,
} from '@/constants/lang_chain_template/chat';
import { processChatStream } from '@/libs/utils/stream';

@Injectable()
export class RagService {
  constructor(
    private readonly qdrantService: QdrantService,
    private readonly ollamaService: OllamaService,
  ) {}

  async generateReport(question: string): Promise<string> {
    const prompt = ChatPromptTemplate.fromTemplate(AUDIT_REPORT_TEMPLATE);
    const retriever = this.qdrantService.vectorStore
      ? this.qdrantService.vectorStore.asRetriever()
      : null;
    const documentChain = await createStuffDocumentsChain({
      llm: this.ollamaService.reportModel,
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
  async chatWithHistory(question: string) {
    const retriever = this.qdrantService.vectorStore
      ? this.qdrantService.vectorStore.asRetriever()
      : null;
    const historyAwarePrompt =
      ChatPromptTemplate.fromTemplate(HISTORY_AWARE_PROMPT);

    const historyAwareRetrieverChain = await createHistoryAwareRetriever({
      llm: this.ollamaService.chatModel,
      retriever,
      rephrasePrompt: historyAwarePrompt,
    });
    // Deprecated (20240702 - Jacky): This is a mock chat history for test purposes.
    // In a real-world scenario, you should replace this with the actual chat history.
    const chatHistory = [
      new HumanMessage('FAITH 是什麼？'),
      new AIMessage('由我們公司開發的會計助手。'),
    ];

    const historyAwareRetrievalPrompt = ChatPromptTemplate.fromTemplate(
      HISTORY_AWARE_RETRIEVAL_PROMPT,
    );

    const historyAwareCombineDocsChain = await createStuffDocumentsChain({
      llm: this.ollamaService.chatModel,
      prompt: historyAwareRetrievalPrompt,
    });

    const conversationalRetrievalChain = await createRetrievalChain({
      retriever: historyAwareRetrieverChain,
      combineDocsChain: historyAwareCombineDocsChain,
    });
    const stream = await conversationalRetrievalChain.stream({
      chat_history: chatHistory,
      input: question,
    });
    const processedStream = processChatStream(stream);

    return processedStream;
  }
  async chat(question: string) {
    const stream = await this.ollamaService.chatModel.stream(question);
    const processedStream = processChatStream(stream);

    return processedStream;
  }
}
