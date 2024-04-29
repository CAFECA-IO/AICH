// Info Murky (20240429): Use package ollama-js from https://github.com/ollama/ollama-js
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatResponse, ListResponse, Ollama } from 'ollama';
@Injectable()
export class LlamaService {
  // Todo: Murky(20240429) 檢查ollama.list() 後 models.name裡面是不是有建立過的
  // 如果沒有才create
  modelName: string;
  modelfile: string;
  ollama: Ollama;
  constructor(
    private configService: ConfigService,
    modelName: string,
    modelfile: string,
  ) {
    this.modelName = modelName;
    this.modelfile = modelfile;
    this.ollama = new Ollama({
      host: this.configService.get<string>('OLLAMA_HOST'),
    });
  }

  // Info Murky(20240429): create a new model if not list in ollama when module is initialized
  async onModuleInit() {
    await this.createModel();
  }

  // Info Murky(20240429): creates a new model if not list in ollama
  public async createModel() {
    const { models }: ListResponse = await this.ollama.list();
    if (!models.some((model) => model.name === this.modelName)) {
      await this.ollama.create({
        model: this.modelName,
        modelfile: this.modelfile,
        stream: false,
      });
    }
  }

  // Info Murky(20240429): generate response from the model, using chat method
  public async generateResponse(text: string) {
    const response: ChatResponse = await this.ollama.chat({
      model: this.modelName,
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
      stream: false,
    });
    return response.message.content;
  }
}
