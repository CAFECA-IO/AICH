import { ITask, TASK_TYPE } from '@/interfaces/task';
import { accountingTaskDecompose } from '@/lib/task_decomposer/accounting';


const taskDecompose = (task: ITask): ITask => {
  let resultTask: ITask;
  switch (task.type) {
    case TASK_TYPE.LLM_ACCOUNTING:
      resultTask = accountingTaskDecompose(task);
      break;
    default:
      resultTask = task;
  }
  return resultTask;
};

export { taskDecompose };
