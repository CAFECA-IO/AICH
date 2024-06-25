import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { AUDIT_REPORT_TEMPLATE } from '@/constants/lang_chain_template/audit_report';
import { QdrantVectorStore } from '@langchain/qdrant';
import {
  CHAT_MODEL,
  EMBEDDING_MODEL,
  MAX_CONCURRENCY,
  OUTPUT_FORMAT,
  QDRANT_COLLECTION_NAME,
} from '@/constants/configs/config';

export async function generateReport(input: string): Promise<any> {
  const prompt = ChatPromptTemplate.fromTemplate(AUDIT_REPORT_TEMPLATE);
  const OLLAMA_HOST = process.env.OLLAMA_HOST;
  const QDRANT_HOST = process.env.QDRANT_HOST;
  const chatOllama = new ChatOllama({
    baseUrl: OLLAMA_HOST, // Default value
    model: CHAT_MODEL, // Default value
    format: OUTPUT_FORMAT,
  });

  const documentChain = await createStuffDocumentsChain({
    llm: chatOllama,
    prompt,
  });

  const nomicEmbedding = new OllamaEmbeddings({
    baseUrl: OLLAMA_HOST, // Default value
    model: EMBEDDING_MODEL, // Can be extracted from the model list
    maxConcurrency: MAX_CONCURRENCY,
  });

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    // splitDocs,
    nomicEmbedding,
    {
      url: QDRANT_HOST,
      collectionName: QDRANT_COLLECTION_NAME,
    },
  );

  const retriever = vectorStore.asRetriever();

  const retrievalChain = await createRetrievalChain({
    combineDocsChain: documentChain,
    retriever,
  });

  const result = await retrievalChain.invoke({
    input,
  });
  return result;
}
