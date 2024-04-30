// Info Murky (20240429): Use package ollama-js from https://github.com/ollama/ollama-js
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatResponse, ModelResponse, Ollama } from 'ollama';
import { LlamaServiceOptions } from 'src/common/interfaces/llama';
@Injectable()
export class LlamaService<T> {
  private logger = new Logger(LlamaService.name);
  private ollama: Ollama;
  constructor(
    private configService: ConfigService,
    @Inject('LLAMA_SERVICE_OPTIONS') private options: LlamaServiceOptions<T>,
  ) {
    this.ollama = new Ollama({
      host: this.configService.get<string>('OLLAMA_HOST'),
    });
  }

  // Info Murky(20240429): create a new model if not list in ollama when module is initialized
  async onModuleInit() {
    try {
      await this.createModel();
      this.logger.log(
        `Model ${this.options.modelName} created, connect to OLLAMA_HOST: ${this.configService.get<string>('OLLAMA_HOST')}`,
      );
    } catch (error) {
      this.logger.error(
        `Model ${this.options.modelName} creation failed\n ${error}`,
      );
    }
  }

  // Info Murky(20240429): creates a new model if not list in ollama
  public async createModel(): Promise<void> {
    let models: ModelResponse[];
    try {
      models = (await this.ollama.list()).models;
    } catch (error) {
      this.logger.error(`Failed to list models from llama\n ${error}`);
      return;
    }
    if (!models.some((model) => model.name === this.options.modelName)) {
      try {
        await this.ollama.create({
          model: this.options.modelName,
          modelfile: this.options.modelfile,
          stream: false,
        });
      } catch (error) {
        this.logger.error(
          `Failed to create model ${this.options.modelName}\n ${error}`,
        );
      }
    }
  }

  private extractJSONFromText(text: string): string | null {
    // This regular expression matches text between triple backticks
    const regex = /```([^`]+)```/;

    // Executing the regex on the input text
    const match = regex.exec(text);

    if (match && match[1]) {
      // match[1] contains the first captured group which is the text between the backticks
      const jsonString = match[1].trim();

      // remove "json" if it is the first word
      if (jsonString.startsWith('json')) {
        return jsonString.slice(4);
      }

      return jsonString;
    }
    return null;
  }

  // Info Murky(20240429): generate response from the model, using chat method
  private async generateResponse(
    text: string,
    retry: boolean = false,
  ): Promise<T | null> {
    let response: ChatResponse;
    try {
      response = await this.ollama.chat({
        model: this.options.modelName,
        messages: [
          {
            role: 'user',
            content: !retry ? text : `你的回應不符合格式，請再試一次 ${text}`,
          },
        ],
        stream: false,
      });
    } catch (error) {
      this.logger.error(
        `LLAMA Failed to chat with model ${this.options.modelName}\n ${error}`,
      );
      return null;
    }

    const data = this.extractJSONFromText(response.message.content);

    console.log('data', data);
    if (!data) {
      return null;
    }

    try {
      return this.options.typeCleaner(JSON.parse(data));
    } catch (error) {
      this.logger.error(`LLAMA Failed to parse JSON data\n ${error}`);
      return null;
    }
  }

  public async genetateResponseLoop(input: string): Promise<T | null> {
    let response: T | null;

    response = await this.generateResponse(input, false);
    let retry = 0;
    while (!response && retry++ < this.options.retryLimit) {
      response = await this.generateResponse(input, true);
    }
    return response;
  }
}
