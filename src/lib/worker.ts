import path from "path";
import { promises as fs } from "fs";
import { ITask, TASK_STATUS } from '@/interfaces/task';
import { JSONValue } from "@/interfaces/json";
import { taskDecompose } from "@/lib/task_decomposer";
import * as agent from "@/lib/agent";
import { mergeReplace } from "@/lib/merge_replace";
import { postprocessAgent } from "@/lib/agent";
import { cleanTask } from "@/lib/common";
import { error } from "console";

const BASE_STORAGE_PATH = process.env.BASE_STORAGE_PATH || '/tmp/AICH';
const tasksDir = path.join(BASE_STORAGE_PATH, 'tasks');

// Info: (20251117 - Luphia) 標記是否已初始化
let isStorageInitialized = false;

// Info: (20251117 - Luphia) 初始化函式，檢查 tasks 資料夾，如果不存在就建立
const initializeStorage = async () => {
  if (isStorageInitialized) {
    return;
  }
  try {
    await fs.mkdir(tasksDir, { recursive: true });
    isStorageInitialized = true;
  } catch (err) {
    console.error(`[Storage] Failed to create base tasks directory: ${tasksDir}`, err);
    // Info: (20251117 - Luphia) 拋出錯誤，讓應用程式的啟動程序知道
    throw new Error(`Storage initialization failed: ${(err as Error).message}`);
  }
};

const assignTask = async (task: ITask, dir = tasksDir) => {
  // Info: (20251117 - Luphia) 簡易的路徑遍歷防禦：檢查 ID 是否包含非法字元
  if (!task.id || task.id.toString().includes('..') || task.id.toString().includes('/')) {
    throw new Error(`Invalid task ID: ${task.id}`);
  }

  try {
    // Info: (20251117 - Luphia) 確保基礎目錄存在 (惰性檢查)
    if (!isStorageInitialized) {
      await initializeStorage();
    }

    const taskDecomposed = taskDecompose(task);

    // Info: (20251117 - Luphia) 建立對應的 task 資料夾
    const taskPath = path.join(dir, taskDecomposed.id.toString());
    await fs.mkdir(taskPath, { recursive: true });

    // Info: (20251117 - Luphia) 準備所有檔案寫入的 Promise
    const now = new Date().getTime();
    taskDecomposed.createdAt = now;
    const taskFilePath = path.join(taskPath, 'task.json');
    const writeTaskPromise = fs.writeFile(taskFilePath, JSON.stringify(taskDecomposed, null, 2));

    // Info: (20251117 - Luphia) 建立任務狀態檔案
    const status = {
      status: TASK_STATUS.PENDING,
      progress: 0,
      updatedAt: now
    };
    const statusFilePath = path.join(taskPath, 'status.json');
    const writeStatusPromise = fs.writeFile(statusFilePath, JSON.stringify(status, null, 2));

    // Info: (20251117 - Luphia) 建立回答檔案
    const resultFilePath = path.join(taskPath, 'result.json');
    const writeResultPromise = fs.writeFile(resultFilePath, JSON.stringify({}));

    // Info: (20251117 - Luphia) 同時執行所有檔案寫入
    await Promise.all([
      writeTaskPromise,
      writeStatusPromise,
      writeResultPromise
    ]);

    // Info: (20251117 - Luphia) 若有 sub-tasks，則遞迴建立
    if (taskDecomposed.tasks && taskDecomposed.tasks.length > 0) {
      // Info: (20251117 - Luphia) 這裡使用 Promise.all 來並行執行所有子任務的 assignTask
      // Info: (20251117 - Luphia) 如果子任務過多，這裡可能需要限流 (concurrency limiting)
      const subTaskPromises = taskDecomposed.tasks.map(subTask => {
        return assignTask(subTask, taskPath);
      });
      await Promise.all(subTaskPromises);
    }
    return taskDecomposed;
  } catch (err) {
    // ToDo: (20251117 - Luphia) 捕捉所有 I/O 錯誤，定義錯誤代碼向上拋出
    console.error(`[assignTask] Failed to assign task ${task.id}:`, err);
    throw err;
  }
};

const getTask = async (taskId: string): Promise<ITask | null> => {
  try {
    const taskDataFilePath = path.join(tasksDir, taskId, 'task.json');
    const taskResultFilePath = path.join(tasksDir, taskId, 'result.json');
    const taskStatusFilePath = path.join(tasksDir, taskId, 'status.json');
    const taskData = await fs.readFile(taskDataFilePath, 'utf-8');
    const taskResult = await fs.readFile(taskResultFilePath, 'utf-8');
    const taskStatus = await fs.readFile(taskStatusFilePath, 'utf-8');
    const data = JSON.parse(taskData);
    const result = JSON.parse(taskResult);
    const status = JSON.parse(taskStatus);
    data.result = result;
    data.status = status.status;
    data.progress = status.progress;
    data.updatedAt = status.updatedAt;
    const cleanData = cleanTask(data);
    return cleanData;
  } catch (error) {
    (error as Error).message += ` (while getting task ID: ${taskId})`;
    return null;
  }
};

// Info: (20251118 - Luphia) 更新狀態的輔助函式
const updateStatus = async (taskPath: string, status: TASK_STATUS, progress: number) => {
  const updatedAt = new Date().getTime();
  const statusFilePath = path.join(taskPath, 'status.json');
  await fs.writeFile(statusFilePath, JSON.stringify({ status, progress, updatedAt }, null, 2));
};

// Info: (20251118 - Luphia) 寫入結果的輔助函式
const updateResult = async (taskPath: string, result: JSONValue) => {
  const resultFilePath = path.join(taskPath, 'result.json');
  await fs.writeFile(resultFilePath, JSON.stringify(result, null, 2));
};

/**
 * Info: (20251118 - Luphia) 執行任務的工作流程
 * @param task 任務物件
 * @param baseDir 任務所在的父目錄 (用於遞迴定位)，預設為 tasksDir
 */
const work = async (task: ITask, baseDir: string = tasksDir) => {
  const currentTaskPath = path.join(baseDir, task.id.toString());

  try {
    // Info: (20251118 - Luphia) 更新狀態為 in_progress
    await updateStatus(currentTaskPath, TASK_STATUS.IN_PROGRESS, 0);

    // Info: (20251118 - Luphia) 1. 如果存在子任務，則遞迴處理子任務
    if (task.tasks && task.tasks.length > 0) {
      const subTaskResults: JSONValue = {};
      let completedCount = 0;
      const totalSubTasks = task.tasks.length;

      // Info: (20251118 - Luphia) 序列執行所有子任務並更新進度
      for (const subTask of task.tasks) {
        try {
          // Info: (20251118 - Luphia) 處理單一子任務前，先合併替換內容
          const mergeReplacedSubTask = (mergeReplace(subTask as unknown as JSONValue, subTaskResults)) as unknown as ITask;
          // Info: (20251118 - Luphia) 遞迴呼叫 work，傳入當前路徑作為 baseDir
          const result = await work(mergeReplacedSubTask, currentTaskPath);
          subTask.result = result;

          subTaskResults[subTask.id] = result;
          completedCount++;

          // Info: (20251118 - Luphia) 1.2. 單一子任務完成後，更新 progress 為完成百分比
          const progress = Math.floor((completedCount / totalSubTasks) * 100);
          await updateStatus(currentTaskPath, TASK_STATUS.IN_PROGRESS, progress);

        } catch (err) {
          // Info: (20251118 - Luphia) 1.3. 如果子任務失敗，更新主任務狀態為 failed 並停止後續子任務執行
          (err as Error).message += ` (while working on sub-task ID: ${subTask.id})`;
          await updateStatus(currentTaskPath, TASK_STATUS.FAILED, Math.floor((completedCount / totalSubTasks) * 100));
          throw err; // Info: (20251118 - Luphia) 向上拋出錯誤以停止流程
        }
      }

      // Info: (20251118 - Luphia) 1.5. 合併子任務結果到主任務的 result 欄位
      await updateResult(currentTaskPath, subTaskResults);

      // Info: (20251118 - Luphia) 1.4. 所有子任務完成後，更新主任務狀態為 completed
      await updateStatus(currentTaskPath, TASK_STATUS.COMPLETED, 100);

      // Info: (20251118 - Luphia) 返回結果供上層使用
      return subTaskResults;

    } else {
      // Info: (20251118 - Luphia) 2. 如果沒有子任務，則執行單一任務的工作流程

      // Info: (20251118 - Luphia) 2.2. 根據任務內容呼叫 agent 執行
      const result = await agent.execute(task);

      // Info: (20251118 - Luphia) 如果任務有 postprocess，則依序執行
      const postprocessResult = await postprocessAgent.execute(result, task.postprocess || []);

      // Info: (20251118 - Luphia) 2.3. 將結果寫入任務的 result 欄位
      await updateResult(currentTaskPath, postprocessResult);
      // Info: (20251118 - Luphia) 2.4. 更新任務狀態為 completed
      await updateStatus(currentTaskPath, TASK_STATUS.COMPLETED, 100);

      return postprocessResult;
    }

  } catch (err) {
    // Info: (20251118 - Luphia) 捕捉自身的錯誤 (例如 agent 執行失敗或 I/O 錯誤)
    (err as Error).message += ` (while working on task ID: ${task.id})`;

    // Info: (20251118 - Luphia) 確保狀態被標記為 failed，保留最後已知進度
    try {
      // Info: (20251118 - Luphia) 讀取當前狀態以保留進度
      const statusPath = path.join(currentTaskPath, 'status.json');
      const currentStatusRaw = await fs.readFile(statusPath, 'utf-8').catch(() => '{"progress": 0}');
      const currentStatus = JSON.parse(currentStatusRaw);

      await updateStatus(currentTaskPath, TASK_STATUS.FAILED, currentStatus.progress || 0);
    } catch (ioErr) {
      console.error(`[Work] Critical error updating status for failed task ${task.id}`, ioErr);
    }

    throw err;
  }
};

export { assignTask, initializeStorage, getTask, work };
