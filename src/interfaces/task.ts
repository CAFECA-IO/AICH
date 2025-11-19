import { JSONValue } from "@/interfaces/json";

export enum ROLE {
  USER = "user",
  MODEL = "model",
}

export enum TASK_TYPE {
  LLM = 'llm',
  LLM_ACCOUNTING = 'llm_accounting',
}

export enum TASK_STATUS {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ITask {
  id: string;
  type: TASK_TYPE;
  contents: JSONValue;
  description: string;
  model?: string;
  status?: TASK_STATUS;
  createdAt?: number;
  updatedAt?: number;
  tasks?: ITask[];
  result?: JSONValue;
}
