import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import {
  FunctionCallOption,
  FunctionDefinition,
} from '@langchain/core/language_models/base';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LangChainModule } from 'src/lang_chain/lang_chain.module';

const functionName = 'lineitem_extraction';
const schema = z.object({
  lineItems: z.array(
    z.object({
      lineItemIndex: z.string().describe('The index of the line item'),
      account: z
        .string()
        .describe('The accounting that the line item belongs to'),
      description: z.string().describe('The description of the line item'),
      debit: z.boolean().describe('Whether the line item is a debit'),
      amount: z.number().describe('The amount of the line item'),
    }),
  ),
});

const EXTRACTION_TEMPLATE = `
你是一位專業的記帳員，傳入的資料是一張發票的json, 你需要轉換成會計傳票上的多行的line items, Extract and save the relevant entities mentioned in the following passage together with their properties.

Passage:
{input}
`;

const prompt = PromptTemplate.fromTemplate(EXTRACTION_TEMPLATE);

const functions: FunctionDefinition[] = [
  {
    name: functionName,
    description: 'Extract the information from the invoice json',
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
    LangChainModule.forRoot({
      moduleName: 'VouchersModule',
      functionCallOption: functionCall,
      functions: functions,
      prompt: prompt,
    }),
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  controllers: [VouchersController],
  providers: [VouchersService],
})
export class VouchersModule {}
