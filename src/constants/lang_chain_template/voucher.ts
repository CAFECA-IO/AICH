import { PromptTemplate } from '@langchain/core/prompts';
import {
  FunctionCallOption,
  FunctionDefinition,
} from '@langchain/core/language_models/base';
import { OllamaParams } from '@/interfaces/lang_chain';
export const VOUCHER_LANGCHAIN_FUNCTION_NAME = 'lineitem_extraction';

// Info: murky (20240512) {{ 與 }} 是為了避免 python f-string 的問題
export const EXTRACTION_TEMPLATE = `
你是一位專業的記帳員，傳入的資料是一張發票的json, 你需要轉換成會計傳票上的的各個條目，這邊稱之為lineItems。
一條lineitem有五個欄位
1. lineItemIndex: 這是一個string，代表這個lineItem的編號，例如20240426001
2. account: 這是一個string，代表這個lineItem屬於的會計科目，例如文書費用
3. description: 這是一個string，代表這個lineItem的描述，例如沒有國家的人(第2版), 憂鬱的貓太郎, 紅與黑(精裝版), 誠品小紙提袋, 國家的品格:個人自由與公共利益
4. debit: 這是一個boolean，代表這個lineItem是借方還是貸方，例如true
5. amount: 這是一個number，代表這個lineItem的金額，例如1500

請記得lineItems debit 和 credit相加的總和要相等，否則會有錯誤。

下面是一個範例invoice json
[
  {{
    "date": 1713052800000,
    "eventType": "income",
    "paymentReason": "電信費",
    "description": "光世代電路月租費： 593, HiNet企業專案服務費: 1607",
    "vendorOrSupplier": "中華電信",
    "payment": {{
      "price": 2310,
      "hasTax": true,
      "taxPercentage": 2200,
      "hasFee": false,
      "fee": 0,
      "paymentMethod": "transfer",
      "paymentPeriod": "atOnce",
      "installmentPeriod": 0,
      "paymentStatus": "unpaid",
      "alreadyPaidAmount": 0
    }}
  }}
]
下面是一個範例回答，但要記得這只是範例，請依照LangChain格式做回答
[
  {{
    lineItemIndex: '20240426001',
    account: '電信費',
    particular: '光世代電路月租費： 593, HiNet企業專案服務費: 1607',
    debit: true,
    amount: 2210
  }},
  {{
    lineItemIndex: '20240325002',
    account: '進項稅額',
    particular: 'WSTP會計師工作輔助幫手: 88,725, 文中網路版主機授權費用: 8,400, 文中工作站授權費用: 6,300',
    debit: true,
    amount: 110
  }},
  {{
    lineItemIndex: '20240426003',
    account: '銀行存款',
    particular: '合庫銀行',
    debit: false,
    amount: 2310
  }},
]

請務必依照LangChain提供給你的格式回答，但不是要你直接回傳zod的schema，如果格式正確就會世界和平，另外你可以得到餅乾作為回報，這個世界就靠你了

Passage:
Extract and save the relevant entities mentioned in the following passage together with their properties.
Invoice json:
{input}

輸出：
`;

export const VOUCHER_LANGCHAIN_PROMPT_TEMPLATE =
  PromptTemplate.fromTemplate(EXTRACTION_TEMPLATE);

export const VOUCHER_RETURN_JSON_TEMPLATE: FunctionDefinition[] = [
  {
    name: VOUCHER_LANGCHAIN_FUNCTION_NAME,
    description: 'Extract the information from the invoice json',
    parameters: {
      type: 'object',

      properties: {
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lineItemIndex: {
                type: 'string',
                description: ', e.g. 20240426001',
              },
              account: {
                type: 'string',
                description:
                  'The accounting that the line item belongs to, e.g. 文書費用',
              },
              description: {
                type: 'string',
                description:
                  'The description of the line item, e.g. 沒有國家的人(第2版), 憂鬱的貓太郎, 紅與黑(精裝版), 誠品小紙提袋, 國家的品格:個人自由與公共利益',
              },
              debit: {
                type: 'boolean',
                description: 'Whether the line item is a debit, e.g. true',
              },
              amount: {
                type: 'number',
                description: 'The amount of the line item, e.g. 1500',
              },
            },
            required: ['account', 'description', 'debit', 'amount'],
            additionalProperties: true,
          },
        },
      },
      required: ['lineItems'],
      additionalProperties: false,
    },
  },
];

export const VOUCHER_LANGCHAIN_FUNCTION_CALL: FunctionCallOption = {
  name: VOUCHER_LANGCHAIN_FUNCTION_NAME,
};

export const VOUCHER_OLLAMA_PARAMS: OllamaParams = {
  mirostat: 2,
  mirostat_eta: 0.1,
  mirostat_tau: 5,
  num_ctx: 4096,
  repeat_last_n: 64,
  repeat_penalty: 1.2,
  temperature: 0.7,
  seed: 845,
  tfs_z: 1,
  num_predict: 512,
  top_k: 80,
  top_p: 0.95,
};
