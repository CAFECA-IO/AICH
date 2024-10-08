import { Injectable, Logger } from '@nestjs/common';
import { QdrantVectorStore } from '@langchain/qdrant';
import { FileProcessService } from '@/api/file_process/file_process.service';
import { OllamaService } from '@/api/ollama/ollama.service';
import {
  DEFAULT_QDRANT_COLLECTION_NAME,
  DEFAULT_QDRANT_HOST,
} from '@/constants/configs/config';

@Injectable()
export class QdrantService {
  private QDRANT_HOST = process.env.QDRANT_HOST ?? DEFAULT_QDRANT_HOST;
  private collectionName =
    process.env.QDRANT_COLLECTION_NAME ?? DEFAULT_QDRANT_COLLECTION_NAME;
  public vectorStore: QdrantVectorStore;
  private readonly logger = new Logger(QdrantService.name);

  constructor(
    private readonly fileProcessService: FileProcessService,
    private readonly ollamaService: OllamaService,
  ) {
    // Info (20240815 - Jacky)調用異步方法初始化 vectorStore
    this.initializeVectorStore();
  }

  private async initializeVectorStore(): Promise<QdrantVectorStore | null> {
    // Info (20240815 - Jacky) 確保所有必要的參數都已經設置
    const { QDRANT_HOST, collectionName } = this;

    if (!this.ollamaService.embeddingModel || !QDRANT_HOST || !collectionName) {
      this.logger.error(
        'Missing required parameters for Qdrant initialization',
      );
      return null;
    }

    try {
      this.vectorStore = await QdrantVectorStore.fromExistingCollection(
        this.ollamaService.embeddingModel,
        {
          url: QDRANT_HOST,
          collectionName,
        },
      );
      return this.vectorStore;
    } catch (error) {
      this.logger.error('Failed to initialize vector store:', error);
      return null;
    }
  }

  // 新增方法以允許更新 collectionName
  public async updateCollectionName(newCollectionName: string) {
    this.collectionName = newCollectionName;
    await this.initializeVectorStore(); // Info (20240815 - Jacky) 重新初始化 vectorStore 以使用新的 collectionName
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
