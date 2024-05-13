import {
  FunctionCallOption,
  FunctionDefinition,
} from '@langchain/core/language_models/base';
import { ParamsFromFString, PromptTemplate } from '@langchain/core/prompts';

export interface LangChainServiceOption {
  moduleName: string; // Info Murky(20240510): Just for logger
  functionCallOption: FunctionCallOption;
  functions: FunctionDefinition[];
  prompt: PromptTemplate<ParamsFromFString<any>, any>;
}
