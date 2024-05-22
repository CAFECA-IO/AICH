import { PromptTemplate } from '@langchain/core/prompts';
import {
  FunctionCallOption,
  FunctionDefinition,
} from '@langchain/core/language_models/base';
// 以下缺少
// projectId: z.string().describe('專案ID'),
// contractId: z.string().describe('合約ID'),

export const EXTRACTION_TEMPLATE = `
你是一位專業的記帳員，傳入的資料是一張發票的文字辨識內容, Extract and save the relevant entities mentioned in the following passage together with their properties.請務必依照LangChain提供給你的格式回答，如果格式正確就會世界和平，另外你可以得到餅乾作為回報，這個世界就靠你了

Passage:
{input}
`;

export const OCR_LANGCHAIN_FUNCTION_NAME = 'extractInvoiceInformation';
export const OCR_LANGCHAIN_PROMPT_TEMPLATE =
  PromptTemplate.fromTemplate(EXTRACTION_TEMPLATE);

export const OCR_RETURN_JSON_SCHEMA: FunctionDefinition[] = [
  {
    name: OCR_LANGCHAIN_FUNCTION_NAME,
    description: 'Extract the information from the invoice',
    parameters: {
      type: 'object',
      properties: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'the date of the invoice, yyyy-mm-dd, ex: 2024-04-14',
          },
          eventType: {
            type: 'string',
            enum: ['income', 'payment', 'transfer'],
            description: '收入, 支付, 或是轉賬, ex: payment',
          },
          paymentReason: {
            type: 'string',
            description: '付款原因，ex: 文書用品',
          },
          description: {
            type: 'string',
            description:
              '發票描述，請依照 項目:價格, 項目:價格, ex: 書本:100, 筆記本:200',
          },
          venderOrSupplyer: {
            type: 'string',
            description: '供應商或銷售商, ex:誠品股份有限公司中山書街分公司',
          },
          payment: {
            type: 'object',
            properties: {
              isRevenue: {
                type: 'boolean',
                description: '是否會創造收入，true是錢會進來，false是錢會出去',
              },
              price: { type: 'number', description: '總金額' },
              hasTax: { type: 'boolean', description: '是否含稅' },
              taxPercentage: {
                type: 'number',
                description: '稅率 0 or 5等金額',
              },
              hasFee: { type: 'boolean', description: '是否含手續額' },
              fee: { type: 'number', description: '手續費 金額' },
              paymentMethod: {
                type: 'string',
                description: '錢收進來會付出去的方法',
              },
              paymentPeriod: {
                type: 'string',
                enum: ['atOnce', 'installment'],
                description: '這份發票有分期付款嗎？，是 atOnce 或 installment',
              },
              installmentPeriod: {
                type: 'number',
                description: '分期付款有幾期',
              },
              paymentAlreadyDone: {
                type: 'number',
                description: '已經付了多少錢, 或是收取多少錢',
              },
              paymentStatus: {
                type: 'string',
                enum: ['paid', 'unpaid', 'partial'],
                description: '付款狀態, ex: paid',
              },
              progress: {
                type: 'number',
                description:
                  '這是給contract 使用的，看contract 實際工作完成了多少%, 不是指付款進度',
              },
            },
            required: [],
            additionalProperties: true,
          },
        },
        required: [],
        additionalProperties: true,
      },
    },
  },
];

export const OCR_FUNCTION_CALL: FunctionCallOption = {
  name: OCR_LANGCHAIN_FUNCTION_NAME,
};
