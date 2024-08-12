export const LRU_CACHE_CONFIG = {
  DEFAULT_CAPACITY: 1000,
  DEFAULT_ID_LENGTH: 10,
};

export const DEFAULT_PORT = process.env.DEFAULT_PORT ?? 3001;

export const LANG_CHAIN_SERVICE_OPTIONS = {
  MODEL: 'llama3',
  RECURSIVE_LIMIT: 1,
};

export const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';

export const DEFAULT_QDRANT_HOST = 'http://127.0.0.1:6333';

export const DEFAULT_REPORT_MODEL = 'llama3.1';

export const DEFAULT_CHAT_MODEL = 'llama3.1';

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

export const DEFAULT_QDRANT_COLLECTION_NAME = 'test';

export const OUTPUT_FORMAT = 'json';

export const MAX_CONCURRENCY = 5;
