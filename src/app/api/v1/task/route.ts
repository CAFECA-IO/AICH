import { z } from "zod";
import { NextRequest } from "next/server";
import { TASK_TYPE, ROLE } from "@/interfaces/task";
import { ApiCode } from '@/lib/status';
import { jsonFail, jsonOk } from '@/lib/response';
import { assignTask, work } from '@/lib/worker';
import { ITask } from "@/interfaces/task";
import { generateTaskId } from "@/lib/task";

// Info: (20251117 - Luphia) 任務資料格式檢驗
// Info: (20251117 - Luphia) 角色 Role
const roleSchema = z.enum(Object.values(ROLE));

// Info: (20251117 - Luphia) 文字內容 Part
const textPartSchema = z.object({
  text: z.string(),
});

// Info: (20251117 - Luphia) 圖片 (InlineData) Part
const inlineDataSchema = z.object({
  mimeType: z.string(),
  data: z.string(), // Info: (20251117 - Luphia) 這是 Base64 字串
});

const inlineDataPartSchema = z.object({
  inlineData: inlineDataSchema,
});

// Info: (20251117 - Luphia) Part Schema：一個 Part 必須是文字或圖片
const partSchema = z.union([textPartSchema, inlineDataPartSchema]);

// Info: (20251117 - Luphia) 定義 Content 和 Contents 結構
// Info: (20251117 - Luphia) 一個 Content 物件 (一次對話)
const contentSchema = z.object({
  role: roleSchema,
  parts: z.array(partSchema).min(1, "一個 Content 至少要有一個 Part"),
});

// Info: (20251117 - Luphia) 最終的 Contents 陣列 (完整的對話歷史)
const contentsSchema = z.array(contentSchema);
// Info: (20251117 - Luphia) 定義 TypeScript 類型
type AiContents = z.infer<typeof contentsSchema>;

/**
 * Info: (20251118 - Luphia) 定義整個 request body 的 schema
 * 這樣可以確保 body 是一個物件，且必定包含 contents 欄位
 */
const requestBodySchema = z.object({
  type: z.enum(Object.values(TASK_TYPE)).optional(),
  contents: contentsSchema,
});

const POST = async (request: NextRequest) => {
  let body: z.infer<typeof requestBodySchema>;

  try {
    // Info: (20251117 - Luphia) 取出請求的 body
    body = await request.json();
  } catch (error) {
    // Info: (20251118 - Luphia) 處理 body 解析錯誤 (例如 JSON 格式錯誤或 body 為空)
    return jsonFail(ApiCode.VALIDATION_ERROR, `Invalid JSON in request body: ${(error as Error).message}`);
  }

  // Info: (20251118 - Luphia) 驗證整個 body 的結構
  const parseResult = requestBodySchema.safeParse(body);

  // Info: (20251117 - Luphia) 如果驗證失敗，回傳錯誤訊息
  if (!parseResult.success) {
    return jsonFail(ApiCode.VALIDATION_ERROR, `Invalid request format: ${parseResult.error.message}`);
  }

  // Info: (20251117 - Luphia) 任務類型，預設為 llm_accounting
  const type = body.type || TASK_TYPE.LLM_ACCOUNTING;

  // Info: (20251117 - Luphia) 將目前 unix timestamp 當作 task id
  const taskId = generateTaskId();
  const result = jsonOk({ task_id: taskId }, 'task created successfully');

  // Info: (20251117 - Luphia) 執行任務但不需要等待結果，只回傳 task id
  const task: ITask = {
    id: taskId,
    type,
    // Info: (20251118 - Luphia) 修正：從驗證成功的資料中取出 contents
    contents: parseResult.data.contents,
    description: 'Thinking',
  }
  const taskDecomposed = await assignTask(task);
  work(taskDecomposed);
  return result;
};

export { contentsSchema, POST };
export type { AiContents };