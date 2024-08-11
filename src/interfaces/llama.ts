export interface LlamaServiceOptions<T> {
  modelName: string;
  modelfile: string;
  typeCleaner?: (rawData: any) => T;
  retryLimit: number;
}
