import { ITask } from "@/interfaces/task";
import { ROLE, TASK_TYPE } from "@/interfaces/task";
import { generateTaskId } from "../task";

const accountingTaskDecompose = (task: ITask): ITask => {
  // Info: (20251118 - Luphia) Task_1 根據輸入詢問問題
  const task1: ITask = {
    id: generateTaskId(),
    type: TASK_TYPE.LLM,
    model: 'gemini-2.5-flash',
    contents: task.contents,
    description: 'Answer the accounting question based on the provided data.',
  };

  // Info: (20251118 - Luphia) Task_2 根據 Task_1 的回答整理會計憑證與傳票 JSON
  const task2: ITask = {
    id: generateTaskId(),
    type: TASK_TYPE.LLM,
    model: 'gemini-2.0-flash-lite',
    contents: [
      {
        role: ROLE.MODEL,
        parts: [
          {
            text: '${data.' + task1.id + '}',
          },
        ],
      },
      {
        role: ROLE.USER,
        parts: [
          {
            text: `上述內容是否有包含會計傳票與憑證的相關資訊？請將結果格式化為一個 JSON 字串，不要包含 "\`\`\`json" 或 "\`\`\`" 等 Markdown 標記，也不要任何其他的說明文字。若無則回傳 null。
            JSON 格式範例：
            {
              taxInfo: {
                invoiceNo: 'AB-12345678',
                issueDate: 1762109170,
                tradingPartner: {
                  name: 'XYZ Corporation',
                  taxId: '12345678',
                },
                taxType: TaxType.TAXABLE,
                taxRate: 0.05,
                salesAmount: 10000,
                tax: 500,
              },
              voucherInfo: {
                lineItems: [
                  {
                    id: 1,
                    account: {
                      id: 1260,
                      accountBookId: 1002,
                      system: 'IFRS',
                      type: 'asset',
                      debit: true,
                      liquidity: true,
                      code: '1139',
                      name: '避險之金融資產－流動',
                      note: null,
                      createdAt: 0,
                      updatedAt: 0,
                      deletedAt: null,
                    },
                    amount: '2002',
                    description: 'Pen-0001',
                    debit: false,
                  },
                  {
                    id: 2,
                    account: {
                      id: 1260,
                      accountBookId: 2342,
                      system: 'IFRS',
                      type: 'asset',
                      debit: true,
                      liquidity: true,
                      code: '3242',
                      name: '現金及約當現金',
                      note: null,
                      createdAt: 0,
                      updatedAt: 0,
                      deletedAt: null,
                    },
                    amount: '2002',
                    description: '',
                    debit: true,
                  },
                ],
                sum: { debit: true, amount: '2002' },
              },
            }`,
          },
        ],
      },
    ],
    description: 'Generate accounting vouchers and journal entries in JSON format.',
    postprocess: ['toJSONValue'],
  };

  const newTask: ITask = {
    ...task,
    tasks: [task1, task2],
  };
  return newTask;
};

export { accountingTaskDecompose };
