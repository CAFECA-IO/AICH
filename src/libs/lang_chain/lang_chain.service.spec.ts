import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';

describe('LangChainService', () => {
  beforeEach(async () => {});

  it('should be defined', async () => {
    const embeddings = new OllamaEmbeddings({
      model: 'llama3', // default value
      baseUrl: 'http://211.22.118.150:11434', // default value
      requestOptions: {
        useMMap: true,
        numThread: 6,
        numGpu: 1,
      },
    });
    const prompt =
      ChatPromptTemplate.fromTemplate(`Answer the following question based only on the provided context:

      <context>
      {context}
      </context>

      Question: {input}`);

    const documents = ['我最喜歡喝珍珠奶茶', 'Bye Bye'];

    const documentEmbeddings = await embeddings.embedDocuments(documents);

    const model = new ChatOllama({
      baseUrl: 'http://211.22.118.150:11434', // Default value
      model: 'llama3', // Default value
    });

    // const messages = [
    //   new SystemMessage("You're a helpful assistant"),
    //   new HumanMessage('我最喜歡喝什麼'),
    // ];
    const docs = [
      new Document({
        pageContent: '夏天我最喜歡喝珍珠奶茶，冬天喜歡喝美噗茶',
      }),
    ];

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
      input: '我冬天最喜歡喝什麼?',
    });
    console.log(result.answer);

    console.log(documentEmbeddings);
  }, 10000000);
});
