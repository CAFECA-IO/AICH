//https://js.langchain.com/docs/integrations/chat/ollama_functions
import { Injectable, Logger } from '@nestjs/common';
import {
  IInvoice,
  IInvoiceWithPaymentMethod,
  cleanInvoiceWithPaymentMethod,
} from '@/common/interfaces/invoice';
import { ProgressStatus } from '@/common/enums/common';
import { LANG_CHAIN_SERVICE_OPTIONS } from '@/constants/configs/config';
import { GoogleVisionService } from '@/google_vision/google_vision.service';
import { LangChainService } from '@/lang_chain/lang_chain.service';
import { LruCacheService } from '@/lru_cache/lru_cache.service';

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
      return this.returnNotSuccessStatus(ProgressStatus.InvalidInput);
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
      return this.returnNotSuccessStatus(ProgressStatus.SystemError);
    }

    try {
      // Info Murky(20240429): 目前會用全部的OCR內容當成key
      const key = getneratedDescription.join(' ');
      let hashedKey = this.cache.hashId(key);

      if (this.cache.get(hashedKey).value) {
        return {
          id: hashedKey,
          status: ProgressStatus.AlreadyUpload,
        };
      }

      hashedKey = this.cache.put(key, ProgressStatus.InProgress, null);

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

      return {
        id: hashedKey,
        status: ProgressStatus.InProgress,
      };
    } catch (error) {
      this.logger.error(
        `Error in generate key in OCR extractTextFromImage: ${error}`,
      );

      return this.returnNotSuccessStatus(ProgressStatus.SystemError);
    }
  }

  public getOCRStatus(resultId: string): ProgressStatus {
    const result = this.cache.get(resultId);
    if (!result) {
      return ProgressStatus.NotFound;
    }

    return result.status;
  }

  public getOCRResult(resultId: string): IInvoice | null {
    const result = this.cache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== ProgressStatus.Success) {
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

        invoiceGenerated = await this.langChainService.invoke(
          {
            input: descriptionString,
          },
          { recursionLimit: LANG_CHAIN_SERVICE_OPTIONS.recursiveLimit },
        );

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
        this.cache.put(hashedId, ProgressStatus.LlmError, null);
        return;
      }

      if (invoiceGenerated) {
        invoiceGenerated.invoiceId = imageName;
        invoiceGenerated.project = project;
        invoiceGenerated.projectId = projectId;
        invoiceGenerated.contract = contract;
        invoiceGenerated.contractId = contractId;
        invoiceGenerated = cleanInvoiceWithPaymentMethod(invoiceGenerated);
        this.cache.put(hashedId, ProgressStatus.Success, invoiceGenerated);
      } else {
        this.cache.put(hashedId, ProgressStatus.LlmError, null);
      }
    } catch (e) {
      this.cache.put(hashedId, ProgressStatus.SystemError, null);
    }
  }
}
