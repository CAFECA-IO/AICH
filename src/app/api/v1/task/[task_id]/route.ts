import { NextRequest } from 'next/server';
import { getTask } from '@/lib/worker';
import { jsonFail, jsonOk } from '@/lib/response';
import { ApiCode } from '@/lib/status';

interface RouteContext {
  params: {
    task_id: string // 必須與動態路由資料夾名稱 [task_id] 匹配
  };
}

const GET = async (req: NextRequest, context: RouteContext) => {
  const { task_id } = await context.params;
  const task = await getTask(task_id);
  if (!task) {
    return jsonFail(ApiCode.NOT_FOUND, `Task not found, ID: ${task_id}`);
  }
  return jsonOk(task);
};

export { GET };
