import { Injectable } from '@nestjs/common';
// import { CreateLangChainDto } from './dto/create-lang-chain.dto';
// import { UpdateLangChainDto } from './dto/update-lang-chain.dto';
import { LruCacheService } from 'src/lru_cache/lru_cache.service';
import { AccountInvoiceData } from 'src/common/interfaces/account';
import { OllamaFunctions } from 'langchain/experimental/chat_models/ollama_functions';
import { HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const model = new OllamaFunctions({
  baseUrl: 'http://192.168.0.147:11434/', // Default value
  model: 'llama3',
}).bind({
  functions: [
    {
      name: 'get_invoice_result',
      description: '從OCR文字獲取發票內容',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'number',
            description: `**日期(date)**：
            - 提取發票上的“日期”。
            - 請將日期從常見格式（如YYYY-MM-DD）轉換為時間戳（秒為單位）。`,
          },
          invoiceId: {
            type: 'string',
            description: `**發票編號（invoiceId）**
          - 不是重要的值，只要回傳是string type就好`,
          },
          eventType: {
            type: 'string',
            description: `**事件類型（eventType）**：
          - 確定發票對應的事件類型，例如“income”、“payment”或“transfer”，transfer指會計上資產或負債在表上的移轉。`,
          },
          paymentReason: {
            type: 'string',
            description: `**付款原因(paymentReason)**：
          - 從發票的描述或標題中提取付款原因，例如“月度服務費”、“產品銷售”。`,
          },
          description: {
            type: 'string',
            description: `**描述(description)**：
          - 提供發票上明確的服務或產品描述，如果有多個品項，請把他們全部列出來之後用,區分，例如“書本1, 書本2”。
          - 很有可能出現在 “項目” 字樣附近，會有好幾條，把他合併成一條用逗點分開`,
          },
          venderOrSupplyer: {
            type: 'string',
            description: `**供應商或銷售商(venderOrSupplyer:)**：
          - 從發票上標識供應商或銷售商的名稱。`,
          },
          payment: {
            type: 'object',
            properties: {
              price: {
                type: 'number',
                description: `**付款詳情(payment)**：
              - 價格(price)：將發票上的**總金額**轉換為數字格式，確保移除任何逗號或貨幣符號。`,
              },
              hasTax: {
                type: 'boolean',
                description: `**付款詳情(payment)**：
              - 是否含稅(hasTax)：根據發票上的提示確認是否含稅，並轉換為布林值（true/false）。`,
              },
              taxPercentage: {
                type: 'number',
                description: `**付款詳情(payment)**：
              - 稅率百分比(taxPercentage)：如果適用，提取稅率百分比並轉換為數字。`,
              },
              hasFee: {
                type: 'boolean',
                description: `**付款詳情(payment)**：
              - 是否含手續費(hasFee)：根據發票上的提示確認是否有額外費用，並轉換為布林值。`,
              },
              fee: {
                type: 'number',
                description: `**付款詳情(payment)**：
              - 費用(fee)：如果適用，提取相關費用並以數字格式表示。`,
              },
            },
          },
        },
        required: [
          'date',
          'invoiceId',
          'eventType',
          'paymentReason',
          'description',
          'venderOrSupplyer',
          'payment',
          'price',
          'hasTax',
          'taxPercentage',
          'hasFee',
          'fee',
        ],
      },
    },
  ],
  // You can set the `function_call` arg to force the model to use a function
  function_call: {
    name: 'get_invoice_result',
  },
});
const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你現在是一位專業的審計員，你需要從發票的文字中提取你發票中包含的資訊，並生成JSON檔案:
  提供的資訊已經是發票經過OCR文字辨識後讀出的資訊,
  
  請確保所有提取的信息精確無誤，並適當格式化以符合系統要求。在無法直接從發票獲取某些信息時，請使用適當的預設值或估算值。`,
  ],
  ['user', '{input}'],
]);
const chain = prompt.pipe(model);
@Injectable()
export class LangChainService {
  constructor(
    private readonly cache: LruCacheService<AccountInvoiceData>,
    // private llamaService: LlamaService<AccountInvoiceData>,
  ) {}
  async createInvoice(
    hashedId: string,
    imageName: string,
    description: string[],
  ) {
    console.log('createInvoice');
    const descriptionString = description.join('\n');
    let invoiceGenerated;
    try {
      console.log(description);
      invoiceGenerated = await chain.invoke({ input: descriptionString });
      // invoiceGenerated.invoiceId = imageName;
      console.log(invoiceGenerated);
    } catch (error) {
      this.cache.put(hashedId, 'error', null);
      return;
    }
    try {
      if (invoiceGenerated) {
        this.cache.put(hashedId, 'success', invoiceGenerated);
      } else {
        this.cache.put(hashedId, 'error', null);
      }
    } catch (e) {
      this.cache.put(hashedId, 'error', null);
      return;
    }
  }

  // createVoucher(createLangChainDto: CreateLangChainDto) {
  //   console.log(createLangChainDto);
  //   return 'This action adds a new langChain';
  // }
  // private async ocrToAccountInvoiceData(
  //   hashedId: string,
  //   imageName: string,
  //   description: string[],
  // ): Promise<void> {
  //   // Todo: post to llama
  //   try {
  //     const descriptionString = description.join('\n');

  //     let invoiceGenerated: AccountInvoiceData;

  //     try {
  //       invoiceGenerated =
  //         await this.llamaService.genetateResponseLoop(descriptionString);

  //       invoiceGenerated.invoiceId = imageName;
  //     } catch (error) {
  //       this.logger.error(
  //         `Error in llama genetateResponseLoop in OCR ocrToAccountInvoiceData: ${error}`,
  //       );
  //       this.cache.put(hashedId, 'error', null);
  //       return;
  //     }

  //     if (invoiceGenerated) {
  //       this.cache.put(hashedId, 'success', invoiceGenerated);
  //     } else {
  //       this.cache.put(hashedId, 'error', null);
  //     }
  //   } catch (e) {
  //     this.cache.put(hashedId, 'error', null);
  //   }
  // }
}
