import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_REPORT_MODEL,
  MAX_CONCURRENCY,
  OUTPUT_FORMAT,
} from '@/constants/configs/config';

@Injectable()
export class OllamaService {
  public reportModel: ChatOllama;
  public chatModel: ChatOllama;
  public embeddingModel: OllamaEmbeddings;
  private readonly OLLAMA_HOST = process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST;
  private readonly CHAT_MODEL = process.env.CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
  private readonly REPORT_MODEL =
    process.env.REPORT_MODEL ?? DEFAULT_REPORT_MODEL;
  private readonly EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  constructor() {
    this.reportModel = new ChatOllama({
      baseUrl: this.OLLAMA_HOST,
      model: this.REPORT_MODEL,
      format: OUTPUT_FORMAT,
      maxConcurrency: MAX_CONCURRENCY,
    });

    this.chatModel = new ChatOllama({
      baseUrl: this.OLLAMA_HOST,
      model: this.CHAT_MODEL,
      maxConcurrency: MAX_CONCURRENCY,
    });

    this.embeddingModel = new OllamaEmbeddings({
      baseUrl: this.OLLAMA_HOST,
      model: this.EMBEDDING_MODEL,
      maxConcurrency: MAX_CONCURRENCY,
    });
  }
}
