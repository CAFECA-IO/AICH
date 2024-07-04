import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import {
  CHAT_MODEL,
  EMBEDDING_MODEL,
  MAX_CONCURRENCY,
  OUTPUT_FORMAT,
} from '@/constants/configs/config';

@Injectable()
export class OllamaService {
  public llama3Chat: ChatOllama;
  public llama3Report: ChatOllama;
  public nomicEmbedding: OllamaEmbeddings;
  private readonly OLLAMA_HOST = process.env.OLLAMA_HOST;

  constructor() {
    this.llama3Report = new ChatOllama({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: CHAT_MODEL, // 默認值
      format: OUTPUT_FORMAT, // 輸出格式
    });

    this.llama3Chat = new ChatOllama({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: CHAT_MODEL, // 默認值
    });

    this.nomicEmbedding = new OllamaEmbeddings({
      baseUrl: this.OLLAMA_HOST, // 默認值
      model: EMBEDDING_MODEL, // 可從模型列表中提取
      maxConcurrency: MAX_CONCURRENCY,
    });
  }
}
