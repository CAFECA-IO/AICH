import { JSONValue } from "@/interfaces/json";
import { ITask, TASK_TYPE } from "@/interfaces/task";
import * as llmAgent from "@/lib/agent/llm_agent";
import * as postprocessAgent from "@/lib/agent/postprocess_agent";

const execute = async (task: ITask): Promise<JSONValue> => {
  switch (task.type) {
    case TASK_TYPE.LLM:
    case TASK_TYPE.LLM_ACCOUNTING:
      return llmAgent.execute(task);
    default:
      throw new Error(`Unsupported task type: ${task.type}`);
  }
};

export { execute, postprocessAgent };
