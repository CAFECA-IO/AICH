import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { GoogleVisionModule } from 'src/google_vision/google_vision.module';
import { OcrController } from './ocr.controller';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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

const functionName = 'invoice_extraction';
// 定義事件類型和付款週期類型
const EventType = z.union([
  z.literal('income'),
  z.literal('payment'),
  z.literal('transfer'),
]);
const PaymentPeriodType = z.union([
  z.literal('atOnce'),
  z.literal('installment'),
]);
const PaymentStatusType = z.union([
  z.literal('paid'),
  z.literal('unpaid'),
  z.literal('partial'),
]); // 如果有固定的類型，可以類似 EventType 那樣使用 z.union 定義

// IPayment 接口的 schema
const IPaymentSchema = z.object({
  isRevenue: z
    .boolean()
    .describe('是否會創造收入，true是錢會進來，false是錢會出去'),
  price: z.number().describe('總金額'),
  hasTax: z.boolean().describe('是否含稅'),
  taxPercentage: z.number().describe('稅率 0 or 5等金額'),
  hasFee: z.boolean().describe('是否含手續額'),
  fee: z.number().describe('手續費 金額'),
  paymentMethod: z.string().describe('錢收進來會付出去的方法'),
  paymentPeriod: PaymentPeriodType.describe('是 atOnce 或 installment'),
  installmentPeriod: z.number().describe('分期付款有幾期'),
  paymentAlreadyDone: z.number().describe('已經付了多少錢, 或是收取多少錢'),
  paymentStatus: PaymentStatusType.describe('付款狀態'),
  progress: z
    .number()
    .describe(
      '這是給contract 使用的，看contract 實際工作完成了多少%, 不是指付款進度',
    ),
});

// IInvoiceWithPaymentMethod 接口的 schema
const IInvoiceWithPaymentMethodSchema = z.object({
  invoiceId: z.string().describe('發票ID'),
  date: z.number().describe('timestamp, the date of the invoice'),
  eventType: EventType.describe('收入, 支付, 或是轉賬'),
  paymentReason: z.string().min(0).describe('付款原因，請一定要輸入字'),
  description: z
    .string()
    .min(0)
    .describe(
      '發票描述，請依照 項目:價格, 項目:價格 的格式填寫，請一定要輸入字',
    ),
  venderOrSupplyer: z.string().describe('供應商或銷售商'),
  payment: IPaymentSchema,
});
const EXTRACTION_TEMPLATE = `
你是一位專業的記帳員，傳入的資料是一張發票的文字辨識內容, Extract and save the relevant entities mentioned in the following passage together with their properties.

Passage:
{input}
`;

const prompt = PromptTemplate.fromTemplate(EXTRACTION_TEMPLATE);

const functions: FunctionDefinition[] = [
  {
    name: functionName,
    description: 'Extract the information from the invoice',
    parameters: {
      type: 'object',
      properties: zodToJsonSchema(IInvoiceWithPaymentMethodSchema),
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
