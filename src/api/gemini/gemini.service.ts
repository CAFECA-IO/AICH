import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerateContentResult,
  GoogleGenerativeAI,
} from '@google/generative-ai';
import { GEMINI_MODE, GEMINI_PROMPT } from '@/constants/gemini';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { IAIInvoice, IInvoice } from '@/interfaces/invoice';
import { randomUUID } from 'crypto';
import { PROGRESS_STATUS } from '@/constants/common';
import { AccountResultStatus } from '@/interfaces/account';
import { IAIVoucher } from '@/interfaces/voucher';

@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(GeminiService.name);

  constructor(
    private configService: ConfigService,
    private invoiceCache: LruCacheService<IAIInvoice>,
    private voucherCache: LruCacheService<IAIVoucher>,
  ) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);

    this.logger.log('GeminiService initialized');
  }

  public getInvoiceStatus(resultId: string): PROGRESS_STATUS {
    let status = PROGRESS_STATUS.NOT_FOUND;
    const result = this.invoiceCache.get(resultId);

    if (result) {
      status = result.status;
    }

    return status;
  }

  public getInvoiceResult(resultId: string): IInvoice | null {
    const result = this.invoiceCache.get(resultId);
    let value = null;
    if (result && result.status === PROGRESS_STATUS.SUCCESS) {
      value = result.value;
    }

    return value;
  }

  public startGenerateInvoice(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    let hashedKey = this.generateHashKey(this.invoiceCache);
    let result: AccountResultStatus;

    if (this.invoiceCache.get(hashedKey).value) {
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    } else {
      hashedKey = this.invoiceCache.put(
        hashedKey,
        PROGRESS_STATUS.IN_PROGRESS,
        null,
      );
      this.generateInvoiceContent(hashedKey, imageList);
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    }

    return result;
  }

  private generateHashKey<T>(cache: LruCacheService<T>, fileName?: string) {
    if (!fileName) {
      fileName = randomUUID();
    }
    const hashedId = cache.hashIdWithTimestamp(fileName);
    return hashedId;
  }

  private async generateInvoiceContent(
    hashedKey: string,
    imageList: Express.Multer.File[],
  ) {
    const prompt =
      "You're a professional accountant, please help me to fill in the invoice information below based on the provided invoice image";

    let result: GenerateContentResult;

    // Info: (20241120 - Jacky) Convert to GoogleGenerativeAI.Part object

    const imageParts = imageList.map((image) => {
      return {
        inlineData: {
          mimeType: image.mimetype,
          data: image.buffer.toString('base64'),
        },
      };
    });

    try {
      const geminiModel = this.genAI.getGenerativeModel({
        model: GEMINI_MODE.INVOICE,
        generationConfig: GEMINI_PROMPT.INVOICE,
      });
      result = await geminiModel.generateContent([prompt, ...imageParts]);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in gemini.service: ${error}`,
      );
      this.invoiceCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    try {
      const invoiceFromGemini = JSON.parse(result.response.text());
      this.logger.log(
        `Invoice ID: ${hashedKey} successfully generated content ${invoiceFromGemini}`,
      );
      const invoice: IAIInvoice = invoiceFromGemini;
      this.invoiceCache.put(hashedKey, PROGRESS_STATUS.SUCCESS, invoice);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.invoiceCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    return;
  }

  public startGenerateVoucher(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    let hashedKey = this.generateHashKey(this.voucherCache);
    let result: AccountResultStatus;

    if (this.voucherCache.get(hashedKey).value) {
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    } else {
      hashedKey = this.voucherCache.put(
        hashedKey,
        PROGRESS_STATUS.IN_PROGRESS,
        null,
      );
      this.generateVoucherContent(hashedKey, imageList);
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    }

    return result;
  }

  private async generateVoucherContent(
    hashedKey: string,
    imageList: Express.Multer.File[],
  ) {
    const prompt =
      "You're a professional accountant, please help me to fill in the voucher information below based on the provided invoice image";

    let result: GenerateContentResult;

    const imageParts = imageList.map((image) => {
      return {
        inlineData: {
          mimeType: image.mimetype,
          data: image.buffer.toString('base64'),
        },
      };
    });

    try {
      const geminiModel = this.genAI.getGenerativeModel({
        model: GEMINI_MODE.VOUCHER,
        generationConfig: GEMINI_PROMPT.VOUCHER,
      });
      result = await geminiModel.generateContent([prompt, ...imageParts]);
    } catch (error) {
      this.logger.error(
        `Voucher ID: ${hashedKey} LLM Error in generateContent in gemini.service: ${error}`,
      );
      this.voucherCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    try {
      const voucherFromGemini = JSON.parse(result.response.text());
      this.logger.log(
        `Voucher ID: ${hashedKey} successfully generated content ${voucherFromGemini}`,
      );
      this.voucherCache.put(
        hashedKey,
        PROGRESS_STATUS.SUCCESS,
        voucherFromGemini,
      );
    } catch (error) {
      this.logger.error(
        `Voucher ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.voucherCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    return;
  }

  public getVoucherAnalyzingStatus(resultId: string): PROGRESS_STATUS {
    const result = this.voucherCache.get(resultId);
    if (!result) {
      return PROGRESS_STATUS.NOT_FOUND;
    }

    return result.status;
  }

  public getVoucherAnalyzingResult(resultId: string): IAIVoucher | null {
    const result = this.voucherCache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== PROGRESS_STATUS.SUCCESS) {
      return null;
    }

    return result.value;
  }
}
