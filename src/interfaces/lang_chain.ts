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
  ollamaParams: OllamaParams;
}

export interface OllamaParams {
  mirostat: number;
  mirostat_eta: number;
  mirostat_tau: number;
  num_ctx: number;
  repeat_last_n: number;
  repeat_penalty: number;
  temperature: number;
  seed: number;
  tfs_z: number;
  num_predict: number;
  top_k: number;
  top_p: number;
}
