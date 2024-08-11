//https://js.langchain.com/docs/integrations/chat/ollama_functions
import { Injectable, Logger } from '@nestjs/common';
import { IInvoice } from '@/interfaces/invoice';
import { PROGRESS_STATUS } from '@/constants/common';
import { LANG_CHAIN_SERVICE_OPTIONS } from '@/constants/configs/config';
import { GoogleVisionService } from '@/libs/google_vision/google_vision.service';
import { LangChainService } from '@/libs/lang_chain/lang_chain.service';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { cleanInvoice } from '@/libs/utils/type_cleaner/invoice';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly googleVisionService: GoogleVisionService,
    private readonly cache: LruCacheService<IInvoice>,
    private langChainService: LangChainService,
  ) {
    this.logger.log('OcrService initialized');
  }

  private async returnNotSuccessStatus(errorMessage: PROGRESS_STATUS) {
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
    projectId: number | undefined,
    contract: string | undefined,
    contractId: number | undefined,
  ): Promise<{
    id: string;
    status: PROGRESS_STATUS;
  }> {
    if (!imageName || !project || !projectId || !contract || !contractId) {
      return this.returnNotSuccessStatus(PROGRESS_STATUS.INVALID_INPUT);
    }

    // Info Murky(20240429): image Buffer is the "Buffer" type of the image file
    let generatedDescription: string[];

    try {
      generatedDescription = await this.googleVisionService.generateDescription(
        image.buffer,
      );

      if (!generatedDescription) {
        throw new Error("OCR can't parse any text from the image");
      }
    } catch (error) {
      this.logger.error(
        `Error in google generateDescription in OCR extractTextFromImage: ${error}`,
      );

      // Info Murky(20240429): if error, return error message, and add to cache
      return this.returnNotSuccessStatus(PROGRESS_STATUS.SYSTEM_ERROR);
    }

    try {
      // Info Murky(20240429): 目前會用全部的OCR內容當成key
      const key = generatedDescription.join(' ');
      let hashedKey = this.cache.hashId(key);

      if (this.cache.get(hashedKey).value) {
        return {
          id: hashedKey,
          status: PROGRESS_STATUS.ALREADY_UPLOAD,
        };
      }

      hashedKey = this.cache.put(key, PROGRESS_STATUS.IN_PROGRESS, null);

      // Info Murky (20240423) this is async function, but we don't await
      // it will be processed in background
      this.ocrToAccountInvoiceData(
        hashedKey,
        project,
        projectId,
        contract,
        contractId,
        generatedDescription,
      );

      return {
        id: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    } catch (error) {
      this.logger.error(
        `Error in generate key in OCR extractTextFromImage: ${error}`,
      );

      return this.returnNotSuccessStatus(PROGRESS_STATUS.SYSTEM_ERROR);
    }
  }

  public getOCRStatus(resultId: string): PROGRESS_STATUS {
    const result = this.cache.get(resultId);
    if (!result) {
      return PROGRESS_STATUS.NOT_FOUND;
    }

    return result.status;
  }

  public getOCRResult(resultId: string): IInvoice | null {
    const result = this.cache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== PROGRESS_STATUS.SUCCESS) {
      return null;
    }

    return result.value;
  }

  private async ocrToAccountInvoiceData(
    hashedId: string,
    project: string,
    projectId: number,
    contract: string,
    contractId: number,
    description: string[],
  ): Promise<void> {
    try {
      const descriptionString = description.join('\n');

      let invoiceGenerated: any;

      try {
        this.logger.log(`OCR id ${hashedId} start to generate invoice`);

        invoiceGenerated = await this.langChainService.invoke(
          {
            input: descriptionString,
          },
          { recursionLimit: LANG_CHAIN_SERVICE_OPTIONS.RECURSIVE_LIMIT },
        );

        // Depreciate Murky (20240429): debug
        console.log(JSON.stringify(invoiceGenerated, null, 2));

        if (!invoiceGenerated) {
          const errorMessage = `ID: ${hashedId} => OCR can't parse any text from LLaMA`;
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
      } catch (error) {
        this.logger.error(
          `ID: ${hashedId} => Error in llama generateResponseLoop in OCR ocrToAccountInvoiceData: ${error}`,
        );
        this.cache.put(hashedId, PROGRESS_STATUS.LLM_ERROR, null);
        return;
      }

      if (invoiceGenerated?.properties) {
        // Info Murky (20240429): 有的時候LangChain會把回答用properties包起來
        invoiceGenerated = invoiceGenerated.properties;
      }

      if (invoiceGenerated) {
        invoiceGenerated;
        invoiceGenerated.project = project;
        invoiceGenerated.projectId = projectId;
        invoiceGenerated.contract = contract;
        invoiceGenerated.contractId = contractId;
        let cleanedInvoice: IInvoice;
        try {
          cleanedInvoice = cleanInvoice(invoiceGenerated);
        } catch (e) {
          this.logger.error(e);
          throw new Error('Invalid IInvoice');
        }
        this.cache.put(hashedId, PROGRESS_STATUS.SUCCESS, cleanedInvoice);
        this.logger.log(`OCR id ${hashedId} success`);
      } else {
        this.cache.put(hashedId, PROGRESS_STATUS.LLM_ERROR, null);
        this.logger.error(
          `OCR id ${hashedId} failed to generate invoice: LLM_ERROR`,
        );
      }
    } catch (e) {
      this.logger.error(e);
      this.cache.put(hashedId, PROGRESS_STATUS.SYSTEM_ERROR, null);
    }
  }
}
