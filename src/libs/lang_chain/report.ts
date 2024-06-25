import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { AUDIT_REPORT_TEMPLATE } from '../../constants/lang_chain_template/audit_report';
import { QdrantVectorStore } from '@langchain/qdrant';

export async function generateReport(input: string): Promise<any> {
  const prompt = ChatPromptTemplate.fromTemplate(AUDIT_REPORT_TEMPLATE);

  const chatOllama = new ChatOllama({
    baseUrl: process.env.OLLAMA_HOST, // Default value
    model: 'llama3', // Default value
    format: 'json',
  });

  const documentChain = await createStuffDocumentsChain({
    llm: chatOllama,
    prompt,
  });

  const nomicEmbedding = new OllamaEmbeddings({
    baseUrl: process.env.OLLAMA_HOST, // Default value
    model: 'nomic-embed-text', // Can be extracted from the model list
    maxConcurrency: 5,
  });

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    // splitDocs,
    nomicEmbedding,
    {
      url: process.env.QDRANT_HOST as string,
      collectionName: 'a_test_collection',
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
  console.log('🚀 ~ generateReport ~ result:', result.answer);
  return result;
}
