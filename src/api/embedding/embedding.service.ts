import { Injectable } from '@nestjs/common';
import { UpdateEmbeddingDto } from '@/api/embedding/dto/update-embedding.dto';
import { processPDF } from '@/libs/lang_chain/data_loader';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ConfigService } from '@nestjs/config';
import { QdrantVectorStore } from '@langchain/qdrant';
import {
  EMBEDDING_MODEL,
  MAX_CONCURRENCY,
  QDRANT_COLLECTION_NAME,
} from '@/constants/configs/config';

@Injectable()
export class EmbeddingService {
  private readonly nomicEmbedding: OllamaEmbeddings;
  private QDRANT_HOST = process.env.QDRANT_HOST;
  constructor(private configService: ConfigService) {
    this.nomicEmbedding = new OllamaEmbeddings({
      baseUrl: this.QDRANT_HOST, // Default value
      model: EMBEDDING_MODEL, // Can be extracted from the model list
      maxConcurrency: MAX_CONCURRENCY,
    });
  }
  async create(filePath: string) {
    // should be a upload file
    const docs = await processPDF(filePath);
    // store the file in temp
    // split text should be optimized
    const splitter = new RecursiveCharacterTextSplitter();

    const splitDocs = await splitter.splitDocuments(docs);

    // store in qdrant
    await QdrantVectorStore.fromDocuments(splitDocs, this.nomicEmbedding, {
      url: this.QDRANT_HOST,
      // should change to a unique name
      collectionName: QDRANT_COLLECTION_NAME,
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
