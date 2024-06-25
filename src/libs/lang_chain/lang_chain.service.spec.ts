import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { AUDIT_REPORT_TEMPLATE } from '../../constants/lang_chain_template/audit_report';
import { processPDF } from './data_loader';

describe('LangChainService', () => {
  beforeEach(async () => {});

  it('should be defined', async () => {
    const embeddings = new OllamaEmbeddings({
      baseUrl: 'http://211.22.118.150:11434', // Default value
      model: 'llama3',
      maxConcurrency: 5,
    });
    const prompt = ChatPromptTemplate.fromTemplate(AUDIT_REPORT_TEMPLATE);

    const docs = await processPDF(
      'src/docs/TSMC 2024Q1 Consolidatd Financial Statements_C.pdf',
    );

    const model = new ChatOllama({
      baseUrl: 'http://211.22.118.150:11434', // Default value
      model: 'llama3', // Default value
    });

    const documentChain = await createStuffDocumentsChain({
      llm: model,
      prompt,
    });

    const splitter = new RecursiveCharacterTextSplitter();

    const splitDocs = await splitter.splitDocuments(docs);

    const vectorstore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      embeddings,
    );

    const retriever = vectorstore.asRetriever();

    const retrievalChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever,
    });

    const result = await retrievalChain.invoke({
      input: '幫我寫一份審計報告',
    });
    console.log(result.answer);
  }, 10000000);
});
