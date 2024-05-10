//https://js.langchain.com/docs/integrations/chat/ollama_functions
import { Injectable, Logger } from '@nestjs/common';
import { AccountInvoiceData } from 'src/common/interfaces/account';
import { ProgressStatus } from 'src/common/types/common';
import { GoogleVisionService } from 'src/google_vision/google_vision.service';
import { LlamaService } from 'src/llama/llama.service';
import { LruCacheService } from 'src/lru_cache/lru_cache.service';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly googleVisionService: GoogleVisionService,
    private readonly cache: LruCacheService<AccountInvoiceData>,
    private llamaService: LlamaService<AccountInvoiceData>,
  ) {
    this.logger.log('OcrService initialized');
  }

  public async extractTextFromImage(
    image: Express.Multer.File,
    imageName: string,
  ): Promise<string> {
    // Info Murky(20240429): image Buffer is the "Buffer" type of the image file
    let getneratedDescription: string[];

    try {
      getneratedDescription =
        await this.googleVisionService.generateDescription(image.buffer);
    } catch (error) {
      this.logger.error(
        `Error in google generateDescription in OCR extractTextFromImage: ${error}`,
      );
      return 'error';
    }

    try {
      const key = getneratedDescription[0];
      let hashedKey = this.cache.hashId(key);

      if (this.cache.get(hashedKey).value) {
        return `Already uploaded, resultId: ${hashedKey}`;
      }
      hashedKey = this.cache.put(key, 'inProgress', null);

      // Info Murky (20240423) this is async function, but we don't await
      // it will be processed in background
      this.ocrToAccountInvoiceData(hashedKey, imageName, getneratedDescription);
      return hashedKey;
    } catch (error) {
      this.logger.error(
        `Error in generate key in OCR extractTextFromImage: ${error}`,
      );
      return 'error';
    }
  }

  public getOCRStatus(resultId: string): ProgressStatus {
    const result = this.cache.get(resultId);
    if (!result) {
      return 'notFound';
    }

    return result.status;
  }

  public getOCRResult(resultId: string): AccountInvoiceData | null {
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
    description: string[],
  ): Promise<void> {
    // Todo: post to llama
    try {
      const descriptionString = description.join('\n');

      let invoiceGenerated: AccountInvoiceData;

      try {
        invoiceGenerated =
          await this.llamaService.genetateResponseLoop(descriptionString);

        invoiceGenerated.invoiceId = imageName;
      } catch (error) {
        this.logger.error(
          `Error in llama genetateResponseLoop in OCR ocrToAccountInvoiceData: ${error}`,
        );
        this.cache.put(hashedId, 'error', null);
        return;
      }

      if (invoiceGenerated) {
        this.cache.put(hashedId, 'success', invoiceGenerated);
      } else {
        this.cache.put(hashedId, 'error', null);
      }
    } catch (e) {
      this.cache.put(hashedId, 'error', null);
    }
  }
}
