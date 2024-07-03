// rag.service.ts
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
  async chatWithHistory(question: string): Promise<string> {
    const retriever = this.qdrantService.vectorStore.asRetriever();
    const historyAwarePrompt =
      ChatPromptTemplate.fromTemplate(HISTORY_AWARE_PROMPT);

    const historyAwareRetrieverChain = await createHistoryAwareRetriever({
      llm: this.ollamaService.llama3,
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
      llm: this.ollamaService.llama3,
      prompt: historyAwareRetrievalPrompt,
    });

    const conversationalRetrievalChain = await createRetrievalChain({
      retriever: historyAwareRetrieverChain,
      combineDocsChain: historyAwareCombineDocsChain,
    });
    let answer: string;
    const maxRetries = 3;
    for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
      try {
        const result = await conversationalRetrievalChain.invoke({
          chat_history: chatHistory,
          input: question,
        });
        answer = result.answer;
        break; // Exit the loop if successful
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          answer = 'I am sorry, I am unable to answer your question.';
        }
      }
    }
    return answer;
  }
}
