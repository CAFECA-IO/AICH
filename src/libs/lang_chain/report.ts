import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { AUDIT_REPORT_TEMPLATE } from '@/constants/lang_chain_template/audit_report';
import { QdrantVectorStore } from '@langchain/qdrant';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_QDRANT_COLLECTION_NAME,
  DEFAULT_REPORT_MODEL,
  MAX_CONCURRENCY,
  OUTPUT_FORMAT,
} from '@/constants/configs/config';

export async function generateReport(input: string): Promise<any> {
  const prompt = ChatPromptTemplate.fromTemplate(AUDIT_REPORT_TEMPLATE);
  const OLLAMA_HOST = process.env.OLLAMA_HOST;
  const QDRANT_HOST = process.env.QDRANT_HOST;
  const REPORT_MODEL = process.env.REPORT_MODEL ?? DEFAULT_REPORT_MODEL;
  const EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const collectionName =
    process.env.QDRANT_COLLECTION_NAME ?? DEFAULT_QDRANT_COLLECTION_NAME;
  const chatOllama = new ChatOllama({
    baseUrl: OLLAMA_HOST, // Default value
    model: REPORT_MODEL, // Default value
    format: OUTPUT_FORMAT,
  });

  const documentChain = await createStuffDocumentsChain({
    llm: chatOllama,
    prompt,
  });

  const embeddingModel = new OllamaEmbeddings({
    baseUrl: OLLAMA_HOST, // Default value
    model: EMBEDDING_MODEL, // Can be extracted from the model list
    maxConcurrency: MAX_CONCURRENCY,
  });

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    // splitDocs,
    embeddingModel,
    {
      url: QDRANT_HOST,
      collectionName: collectionName,
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
