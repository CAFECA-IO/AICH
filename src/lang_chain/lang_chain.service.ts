// https://js.langchain.com/docs/integrations/chat/ollama_functions
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LangChainServiceOption } from 'src/common/interfaces/lang_chain';
import {
  ChatOllamaFunctionsCallOptions,
  OllamaFunctions,
} from 'langchain/experimental/chat_models/ollama_functions';
import { Runnable } from '@langchain/core/dist/runnables/base';
import { BaseLanguageModelInput } from '@langchain/core/dist/language_models/base';
import { BaseMessageChunk } from '@langchain/core/dist/messages';
import { LANG_CHAIN_SERVICE_OPTIONS } from 'src/constants/configs/config';
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';
import { ParamsFromFString } from '@langchain/core/prompts';
import { RunnableConfig } from '@langchain/core/runnables';

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  private baseUrl: string = this.configService.get<string>('OLLAMA_HOST');
  private model: Runnable<
    BaseLanguageModelInput,
    BaseMessageChunk,
    ChatOllamaFunctionsCallOptions
  >;
  private chain: Runnable<ParamsFromFString<any>, never, RunnableConfig>;
  constructor(
    @Inject('LANG_CHAIN_SERVICE_OPTIONS')
    private options: LangChainServiceOption,
    private configService: ConfigService,
  ) {
    // Info murky(20240429): create a new model if not list in ollama when module is initialized
    this.model = new OllamaFunctions({
      model: LANG_CHAIN_SERVICE_OPTIONS.model,
      baseUrl: this.baseUrl,
    }).bind({
      functions: options.functions,
      function_call: options.functionCallOption,
    });
  }

  async onModuleInit() {
    this.chain = await this.options.prompt
      .pipe(this.model)
      .pipe(new JsonOutputFunctionsParser());
    this.logger.log(
      `${this.options.moduleName}'s LangChainService initialized`,
    );
  }
  async invoke(
    input: ParamsFromFString<any>,
    options?: Partial<RunnableConfig>,
  ) {
    const response = await this.chain.invoke(input, options);
    return response;
  }
}
