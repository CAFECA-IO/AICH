import { randomBytes } from 'crypto';
import { JSONValue } from '@/interfaces/json';
import { ITask } from '@/interfaces/task';

const randomHex = (length = 8): string => {
  const byteLength = Math.ceil(length / 2);
  return randomBytes(byteLength).toString('hex').slice(0, length);
};

const toJSONValue = (input: string): JSONValue | undefined => {
  /**
   * Info: (20251119 - Luphia)
   * 將第一個 { 或 [ 之前的字元全部移除，並決定結尾字符
   * 將最後一個結尾字符之後的字元全部移除
   * 處理完後嘗試轉換成 JSONValue，失敗則回傳 undefined
   */
  const firstCurly = input.indexOf('{');
  const firstSquare = input.indexOf('[');
  let startIndex = -1;

  if (firstCurly === -1 && firstSquare === -1) {
    return undefined;
  } else if (firstCurly === -1) {
    startIndex = firstSquare;
  } else if (firstSquare === -1) {
    startIndex = firstCurly;
  } else {
    startIndex = Math.min(firstCurly, firstSquare);
  }

  const openingChar = input[startIndex];
  const closingChar = openingChar === '{' ? '}' : ']';
  let endIndex = -1;
  let balance = 0;

  for (let i = startIndex; i < input.length; i++) {
    if (input[i] === openingChar) {
      balance++;
    } else if (input[i] === closingChar) {
      balance--;
      if (balance === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return undefined;
  }

  const jsonString = input.slice(startIndex, endIndex + 1);

  try {
    return JSON.parse(jsonString) as JSONValue;
  } catch {
    return undefined;
  }
}

const cleanTask = (task: ITask): ITask => {
  const steps = task.tasks?.map((subtask) => subtask.description) || [];
  // Info: (20251118 - Luphia) 移除任務中的敏感或不必要欄位
  const result: ITask = {
    id: task.id,
    type: task.type,
    contents: [],
    description: task.description,
    status: task.status,
    progress: task.progress,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    steps,
    result: task.result
  };

  return result;
};

export { randomHex, toJSONValue, cleanTask };
