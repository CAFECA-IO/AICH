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
const schema = z.object({
  invoice: z.object({
    date: z.number().describe('timestamp, the date of the invoice'),
    eventType: z.string().describe("how to, 'income' | 'payment' | 'transfer'"),
    paymentReason: z.string().describe('The reason for the payment'),
    description: z
      .string()
      .describe(
        'The items in the invoice, separated by commas, format: "item: price, item: price, ..."',
      ),
    verderOrSupplyer: z
      .string()
      .describe('The vendor or supplier of the invoice'),

    payment: z.object({
      isRevenue: z
        .boolean()
        .describe(
          'Whether the payment will create revenue, true is money will come in, false is money will go out',
        ),
      price: z.number().describe('Total amount happen in this invoice'),
      hasTax: z.boolean().describe('Whether it includes tax'),
      taxPercentage: z.number().describe('Tax rate 0 or 5, etc.'),
      hasFee: z.boolean().describe('Whether it includes handling fee'),
      fee: z.number().describe('Handling fee amount'),
      paymentMethod: z
        .string()
        .describe('The method of payment when money comes in and goes out'),
      paymentPeriod: z.string().describe('is atOnce or installment'),
      installmentPeriod: z
        .number()
        .describe('How many periods are there in the installment payment'),
      paymentAlreadyDone: z
        .number()
        .describe('How much money has been paid or received'),
      paymentStatus: z.string().describe('Payment status'),
      progress: z
        .number()
        .describe(
          'This is for the contract, see how much work has been done in contract, not the payment progress',
        ),
    }),
  }),
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
      properties: zodToJsonSchema(schema),
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
