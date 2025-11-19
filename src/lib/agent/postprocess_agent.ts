import { JSONValue } from "@/interfaces/json";
import { toJSONValue } from "@/lib/common";

enum POSTPROCESS {
  TO_JSON_VALUE = 'toJSONValue',
}

const execute = async (result: JSONValue, processes: string[]): Promise<JSONValue> => {
  let processedResult = result;
  for (const process of processes) {
    switch (process) {
      // Info: (20251118 - Luphia) 將結果轉換為 JSONValue 格式
      case POSTPROCESS.TO_JSON_VALUE:
        if (typeof processedResult === 'string') {
          const jsonValue = toJSONValue(processedResult);
          if (jsonValue !== undefined) {
            processedResult = jsonValue;
          }
        }
        break;

      // Info: (20251118 - Luphia) 無法識別的後處理流程，不做任何加工
      default:
        break;
    }
  }
  return processedResult;
};

export { execute, POSTPROCESS };
