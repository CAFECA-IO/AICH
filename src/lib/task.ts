import { randomHex } from "./common"

const generateTaskId = (): string => {
  const timestamp = Date.now().toString();
  const randomHexString = randomHex(8);
  const taskId = `${timestamp}${randomHexString}`;
  return taskId;
};

export { generateTaskId };
