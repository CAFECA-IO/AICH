import { Injectable } from '@nestjs/common';
import { CreateEmbeddingDto } from './dto/create-embedding.dto';
import { UpdateEmbeddingDto } from './dto/update-embedding.dto';
import { processPDF } from '@/libs/lang_chain/data_loader';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ConfigService } from '@nestjs/config';
import { QdrantVectorStore } from '@langchain/qdrant';

@Injectable()
export class EmbeddingService {
  private readonly nomicEmbedding: OllamaEmbeddings;
  constructor(private configService: ConfigService) {
    this.nomicEmbedding = new OllamaEmbeddings({
      baseUrl: this.configService.get<string>('QDRANT_HOST'), // Default value
      model: 'nomic-embed-text', // Can be extracted from the model list
      maxConcurrency: 5,
    });
  }
  async create(createEmbeddingDto: CreateEmbeddingDto) {
    console.log(
      '🚀 ~ EmbeddingService ~ create ~ createEmbeddingDto:',
      createEmbeddingDto,
    );
    // should be a upload file
    const docs = await processPDF(
      'src/docs/TSMC 2024Q1 Consolidatd Financial Statements_C.pdf',
    );
    // store the file in temp
    // split text should be optimized
    const splitter = new RecursiveCharacterTextSplitter();

    const splitDocs = await splitter.splitDocuments(docs);

    // store in qdrant
    await QdrantVectorStore.fromDocuments(splitDocs, this.nomicEmbedding, {
      url: this.configService.get<string>('QDRANT_HOST'),
      // should change to a unique name
      collectionName: 'a_test_collection',
    });
    return 'This action store a new embedding';
  }

  findAll() {
    return `This action returns all embedding`;
  }

  findOne(id: number) {
    return `This action returns a #${id} embedding`;
  }

  update(id: number, updateEmbeddingDto: UpdateEmbeddingDto) {
    console.log(
      '🚀 ~ EmbeddingService ~ update ~ updateEmbeddingDto:',
      updateEmbeddingDto,
    );
    return `This action updates a #${id} embedding`;
  }

  remove(id: number) {
    return `This action removes a #${id} embedding`;
  }
}
