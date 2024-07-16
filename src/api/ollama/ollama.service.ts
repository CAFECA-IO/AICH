import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import {
  CHAT_TAIDE,
  EMBEDDING_MODEL,
  MAX_CONCURRENCY,
  OUTPUT_FORMAT,
} from '@/constants/configs/config';

@Injectable()
export class OllamaService {
  public taideChat: ChatOllama;
  public taideReport: ChatOllama;
  public nomicEmbedding: OllamaEmbeddings;
  private readonly OLLAMA_HOST = process.env.OLLAMA_HOST;

  constructor() {
    this.taideReport = new ChatOllama({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: CHAT_TAIDE, // 默認值
      format: OUTPUT_FORMAT, // 輸出格式
      maxConcurrency: MAX_CONCURRENCY,
    });

    this.taideChat = new ChatOllama({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: CHAT_TAIDE, // 默認值
      maxConcurrency: MAX_CONCURRENCY,
    });

    this.taideChat = new ChatOllama({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: CHAT_TAIDE, // 默認值
      maxConcurrency: MAX_CONCURRENCY,
    });

    this.nomicEmbedding = new OllamaEmbeddings({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: EMBEDDING_MODEL, // 可從模型列表中提取
      maxConcurrency: MAX_CONCURRENCY,
    });
  }
}
