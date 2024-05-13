import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { GoogleVisionModule } from 'src/google_vision/google_vision.module';
import { OcrController } from './ocr.controller';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';
import { LangChainModule } from 'src/lang_chain/lang_chain.module';
import { PromptTemplate } from '@langchain/core/prompts';
import {
  FunctionCallOption,
  FunctionDefinition,
} from '@langchain/core/language_models/base';

// 以下缺少
// invoiceId: z.string().describe('圖片的ID，此值會被覆蓋，請隨意生成'),
// projectId: z.string().describe('專案ID'),
// contractId: z.string().describe('合約ID'),

const EXTRACTION_TEMPLATE = `
你是一位專業的記帳員，傳入的資料是一張發票的文字辨識內容, Extract and save the relevant entities mentioned in the following passage together with their properties.請務必依照LangChain提供給你的格式回答，如果格式正確就會世界和平，另外你可以得到餅乾作為回報，這個世界就靠你了

Passage:
{input}
`;

const functionName = 'extractInvoiceInformation';
const prompt = PromptTemplate.fromTemplate(EXTRACTION_TEMPLATE);

const functions: FunctionDefinition[] = [
  {
    name: functionName,
    description: 'Extract the information from the invoice',
    parameters: {
      type: 'object',
      properties: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: '發票ID，ex:YZ-30887276' },
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
      // properties: {
      //   type: 'object',
      //   properties: {
      //     date: {
      //       type: 'number',
      //       description: `**日期(date)**：
      //       - 提取發票上的“日期”。
      //       - 請將日期從常見格式（如YYYY-MM-DD）轉換為時間戳（秒為單位）。`,
      //     },
      //     invoiceId: {
      //       type: 'string',
      //       description: `**發票編號（invoiceId）**
      //     - 不是重要的值，只要回傳是string type就好`,
      //     },
      //     eventType: {
      //       type: 'string',
      //       description: `**事件類型（eventType）**：
      //     - 確定發票對應的事件類型，例如“income”、“payment”或“transfer”，transfer指會計上資產或負債在表上的移轉。`,
      //     },
      //     paymentReason: {
      //       type: 'string',
      //       description: `**付款原因(paymentReason)**：
      //     - 從發票的描述或標題中提取付款原因，例如“月度服務費”、“產品銷售”。`,
      //     },
      //     description: {
      //       type: 'string',
      //       description: `**描述(description)**：
      //     - 提供發票上明確的服務或產品描述，如果有多個品項，請把他們全部列出來之後用,區分，例如“書本1, 書本2”。
      //     - 很有可能出現在 “項目” 字樣附近，會有好幾條，把他合併成一條用逗點分開`,
      //     },
      //     venderOrSupplyer: {
      //       type: 'string',
      //       description: `**供應商或銷售商(venderOrSupplyer:)**：
      //     - 從發票上標識供應商或銷售商的名稱。`,
      //     },
      //     payment: {
      //       type: 'object',
      //       properties: {
      //         price: {
      //           type: 'number',
      //           description: `**付款詳情(payment)**：
      //         - 價格(price)：將發票上的**總金額**轉換為數字格式，確保移除任何逗號或貨幣符號。`,
      //         },
      //         hasTax: {
      //           type: 'boolean',
      //           description: `**付款詳情(payment)**：
      //         - 是否含稅(hasTax)：根據發票上的提示確認是否含稅，並轉換為布林值（true/false）。`,
      //         },
      //         taxPercentage: {
      //           type: 'number',
      //           description: `**付款詳情(payment)**：
      //         - 稅率百分比(taxPercentage)：如果適用，提取稅率百分比並轉換為數字。`,
      //         },
      //         hasFee: {
      //           type: 'boolean',
      //           description: `**付款詳情(payment)**：
      //         - 是否含手續費(hasFee)：根據發票上的提示確認是否有額外費用，並轉換為布林值。`,
      //         },
      //         fee: {
      //           type: 'number',
      //           description: `**付款詳情(payment)**：
      //         - 費用(fee)：如果適用，提取相關費用並以數字格式表示。`,
      //         },
      //       },
      //     },
      //   },
      //   required: [
      //     'date',
      //     'invoiceId',
      //     'eventType',
      //     'paymentReason',
      //     'description',
      //     'venderOrSupplyer',
      //     'payment',
      //     'price',
      //     'hasTax',
      //     'taxPercentage',
      //     'hasFee',
      //     'fee',
      //   ],
      // },
    },
  },
];

const functionCall: FunctionCallOption = {
  name: functionName,
};

@Module({
  imports: [
    GoogleVisionModule,
    LangChainModule.forRoot({
      moduleName: 'OcrModule',
      functionCallOption: functionCall,
      functions: functions,
      prompt: prompt,
    }),
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  providers: [OcrService],
  controllers: [OcrController],
})
export class OcrModule {}
