//https://js.langchain.com/docs/integrations/chat/ollama_functions
import { Injectable, Logger } from '@nestjs/common';
import {
  IInvoice,
  IInvoiceWithPaymentMethod,
} from 'src/common/interfaces/invoice';
import { ProgressStatus } from 'src/common/types/common';
import { GoogleVisionService } from 'src/google_vision/google_vision.service';
import { LangChainService } from 'src/lang_chain/lang_chain.service';
import { LruCacheService } from 'src/lru_cache/lru_cache.service';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly googleVisionService: GoogleVisionService,
    private readonly cache: LruCacheService<IInvoiceWithPaymentMethod>,
    private langChainService: LangChainService,
  ) {
    this.logger.log('OcrService initialized');
  }

  private async returnNotSuccessStatus(errorMessage: ProgressStatus) {
    const hashedKey = this.cache.put(errorMessage, errorMessage, null);
    return {
      id: hashedKey,
      status: errorMessage,
    };
  }

  public async extractTextFromImage(
    image: Express.Multer.File,
    imageName: string | undefined,
    project: string | undefined,
    projectId: string | undefined,
    contract: string | undefined,
    contractId: string | undefined,
  ): Promise<{
    id: string;
    status: ProgressStatus;
  }> {
    // Todo: 把所有的回傳包成一個function
    if (!imageName || !project || !projectId || !contract || !contractId) {
      return this.returnNotSuccessStatus('invalidInput');
    }

    // Info Murky(20240429): image Buffer is the "Buffer" type of the image file
    let getneratedDescription: string[];

    try {
      getneratedDescription =
        await this.googleVisionService.generateDescription(image.buffer);

      if (!getneratedDescription) {
        throw new Error("OCR can't parse any text from the image");
      }
    } catch (error) {
      this.logger.error(
        `Error in google generateDescription in OCR extractTextFromImage: ${error}`,
      );

      // Info Murky(20240429): if error, return error message, and add to cache
      return this.returnNotSuccessStatus('systemError');
    }

    try {
      // Info Murky(20240429): 目前會用全部的OCR內容當成key
      const key = getneratedDescription.join(' ');
      let hashedKey = this.cache.hashId(key);

      if (this.cache.get(hashedKey).value) {
        return {
          id: hashedKey,
          status: 'alreadyUpload',
        };
      }

      hashedKey = this.cache.put(key, 'inProgress', null);

      // Info Murky (20240423) this is async function, but we don't await
      // it will be processed in background
      this.ocrToAccountInvoiceData(
        hashedKey,
        imageName,
        project,
        projectId,
        contract,
        contractId,
        getneratedDescription,
      );
      // Info (Jacky 20240510): create invoice in lang-chain
      // this.langChainService.createInvoice(
      //   hashedKey,
      //   imageName,
      //   getneratedDescription,
      // );
      return {
        id: hashedKey,
        status: 'inProgress',
      };
    } catch (error) {
      this.logger.error(
        `Error in generate key in OCR extractTextFromImage: ${error}`,
      );

      return this.returnNotSuccessStatus('systemError');
    }
  }

  public getOCRStatus(resultId: string): ProgressStatus {
    const result = this.cache.get(resultId);
    if (!result) {
      return 'notFound';
    }

    return result.status;
  }

  public getOCRResult(resultId: string): IInvoice | null {
    const result = this.cache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== 'success') {
      return null;
    }

    return result.value;
  }

  private async ocrToAccountInvoiceData(
    hashedId: string,
    imageName: string,
    project: string,
    projectId: string,
    contract: string,
    contractId: string,
    description: string[],
  ): Promise<void> {
    // Todo: post to llama
    try {
      const descriptionString = description.join('\n');

      let invoiceGenerated: IInvoiceWithPaymentMethod;

      try {
        // Depreciate Murky (20240429): change to langChain
        // invoiceGenerated =
        //   await this.llamaService.genetateResponseLoop(descriptionString);

        this.logger.log(`OCR id ${hashedId} start to generate invoice`);

        // Info Murky (20240429): invoke langChainService, prompt之後要整理
        const EXTRACTION_TEMPLATE = `
請根據下列資料描述生成符合結構的發票JSON格式。每一個發票應該包括發票ID、日期（時間戳記）、事件類型（收入、支付或轉賬）、付款原因、描述、供應商或銷售商、項目ID、項目名稱、合同ID、合同名稱和付款詳情。付款詳情應包括是否創造收入、總金額、是否含稅、稅率、是否含手續費、手續費金額、付款方式、付款周期（一次性或分期）、分期付款期數、已經付款的金額、付款狀態以及合同進度百分比。

描述:
${descriptionString}

請按照以下格式輸出:
{
  "invoiceId": "string",
  "date": "number",
  "eventType": "income | payment | transfer",
  "paymentReason": "string",
  "description": "string",
  "venderOrSupplyer": "string",
  "payment": {
    "isRevenue": "boolean",
    "price": "number",
    "hasTax": "boolean",
    "taxPercentage": "number",
    "hasFee": "boolean",
    "fee": "number",
    "paymentMethod": "string",
    "paymentPeriod": "atOnce | installment",
    "installmentPeriod": "number",
    "paymentAlreadyDone": "number",
    "paymentStatus": "paid | unpaid | partial",
    "progress": "number"
  }
}
`;

        invoiceGenerated = await this.langChainService.invoke({
          input: EXTRACTION_TEMPLATE,
        });

        // Depreciate Murky (20240429): debug
        console.log(JSON.stringify(invoiceGenerated, null, 2));

        if (!invoiceGenerated) {
          const errorMessage = "OCR can't parse any text from LLaMA";
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
      } catch (error) {
        this.logger.error(
          `Error in llama genetateResponseLoop in OCR ocrToAccountInvoiceData: ${error}`,
        );
        this.cache.put(hashedId, 'llmError', null);
        return;
      }

      if (invoiceGenerated) {
        invoiceGenerated.invoiceId = imageName;
        invoiceGenerated.project = project;
        invoiceGenerated.projectId = projectId;
        invoiceGenerated.contract = contract;
        invoiceGenerated.contractId = contractId;
        this.cache.put(hashedId, 'success', invoiceGenerated);
      } else {
        this.cache.put(hashedId, 'llmError', null);
      }
    } catch (e) {
      this.cache.put(hashedId, 'systemError', null);
    }
  }
}
