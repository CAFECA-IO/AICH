import { Injectable } from '@nestjs/common';
import { QdrantVectorStore } from '@langchain/qdrant';
import { FileProcessService } from '@/api/file_process/file_process.service';
import { QDRANT_COLLECTION_NAME } from '@/constants/configs/config';
import { OllamaService } from '@/api/ollama/ollama.service';

@Injectable()
export class QdrantService {
  private QDRANT_HOST = process.env.QDRANT_HOST; // 需更換為您的 Qdrant 主機地址
  public vectorStore: QdrantVectorStore;

  constructor(
    private readonly fileProcessService: FileProcessService,
    private readonly ollamaService: OllamaService,
  ) {
    // 調用異步方法初始化 vectorStore
    this.initializeVectorStore();
  }

  private async initializeVectorStore() {
    // 可以替換為您的Embedding模型
    try {
      this.vectorStore = await QdrantVectorStore.fromExistingCollection(
        this.ollamaService.nomicEmbedding,
        {
          url: this.QDRANT_HOST, // 需更換為您的 Qdrant 主機地址
          collectionName: QDRANT_COLLECTION_NAME, // 集合名稱
        },
      );
      return this.vectorStore;
    } catch (error) {
      return null;
    }
  }

  async create(filePath: string) {
    // 應該是上傳的文件
    let success = false;
    const splitDocs = await this.fileProcessService.processPDFFile(filePath);

    // 存儲到 Qdrant 中
    if (this.vectorStore) {
      this.vectorStore.addDocuments(splitDocs);
      success = true;
    } else {
      success = false;
    }
    return success;
  }
}
