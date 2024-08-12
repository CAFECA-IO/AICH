import { Injectable } from '@nestjs/common';
import { QdrantVectorStore } from '@langchain/qdrant';
import { FileProcessService } from '@/api/file_process/file_process.service';
import { OllamaService } from '@/api/ollama/ollama.service';
import {
  DEFAULT_QDRANT_COLLECTION_NAME,
  DEFAULT_QDRANT_HOST,
} from '@/constants/configs/config';

@Injectable()
export class QdrantService {
  private QDRANT_HOST = process.env.QDRANT_HOST ?? DEFAULT_QDRANT_HOST; // 需更換為您的 Qdrant 主機地址
  private collectionName =
    process.env.QDRANT_COLLECTION_NAME ?? DEFAULT_QDRANT_COLLECTION_NAME; // 從環境變量中讀取集合名稱
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
        this.ollamaService.embeddingModel,
        {
          url: this.QDRANT_HOST,
          collectionName: this.collectionName, // 使用從環境變量中讀取的集合名稱
        },
      );
      return this.vectorStore;
    } catch (error) {
      return null;
    }
  }

  // 新增方法以允許更新 collectionName
  public async updateCollectionName(newCollectionName: string) {
    this.collectionName = newCollectionName;
    await this.initializeVectorStore(); // 重新初始化 vectorStore 以使用新的 collectionName
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
