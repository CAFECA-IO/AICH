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
    // Matches text between triple backticks with an optional "json" prefix
    const regex = /```(?:json)?([^`]+)```/g;

    let jsonString: string | null = null;
    let match: RegExpExecArray | null;

    // Loop to find the first JSON block
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        jsonString = match[1].trim();
        break; // Stop at the first occurrence
      }
    }

    if (jsonString) {
      // Replace problematic escape characters
      jsonString = jsonString
        .replace(/\s+/g, ' ') // Normalize whitespaces
        .replace(/\\n/g, '') // Remove newline escape characters
        .replace(/\n/g, '')
        .replace(/\\_/g, '_') // Replace escaped underscores
        .replace(/\n/g, '')
        .replace(/\\-/g, '-')
        .replace(/\-/g, '-')
        .replace(/\\t/g, '') // Remove tab escape characters
        .replace(/\t/g, '') // Remove tab escape characters
        .trim();

      try {
        // Validate JSON by parsing

        console.log('jsonStringBeforeParse', jsonString);
        if (this.options.typeCleaner) {
          JSON.parse(jsonString);
        }
        console.log('jsonStringAfterParse', jsonString);
        return jsonString;
      } catch (e) {
        // If parsing fails, return null
        console.error('Invalid JSON extracted:', e);
        return null;
      }
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
            content: !retry
              ? `${text}, 請使用繁體中文回答`
              : `你的回應不符合格式，請再試一次，請務必在你的回答答案前後都加上\`\`\` ${text}`,
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

    // Deprecated: Murky(20240429): Debug
    console.log('llama response', response.message.content);

    const data = !this.options.typeCleaner
      ? response.message.content
      : this.extractJSONFromText(response.message.content);

    console.log('llama data', data);
    if (!data) {
      return null;
    }

    try {
      const result = !this.options.typeCleaner
        ? (data as T) // Info , workaround for type issue
        : this.options.typeCleaner(JSON.parse(data));
      return result;
    } catch (error) {
      this.logger.error(`LLAMA Failed to parse JSON data\n ${error}`);
      return null;
    }
  }

  public async genetateResponseLoop(input: string): Promise<T | null> {
    let response: T | null;

    try {
      response = await this.generateResponse(input, false);
    } catch (error) {
      this.logger.error(`Error in llama genetateResponseLoop: ${error}`);
      return null;
    }

    let retry = 0;
    while (!response && retry++ < this.options.retryLimit) {
      response = await this.generateResponse(input, true);
    }
    return response;
  }
}
