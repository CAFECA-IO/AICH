import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerateContentResult,
  GoogleGenerativeAI,
} from '@google/generative-ai';
import { GEMINI_MODE, GEMINI_PROMPT } from '@/constants/gemini';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { IAIInvoice } from '@/interfaces/invoice';
import { randomUUID } from 'crypto';
import { PROGRESS_STATUS } from '@/constants/common';
import { AccountResultStatus } from '@/interfaces/account';
import { IAIVoucher } from '@/interfaces/voucher';
import { VoucherRepository } from '@/api/repository/voucher.repository';
import { InvoiceRepository } from '@/api/repository/invoice.repository';
import { AiServiceType } from '@/constants/ai';

@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(GeminiService.name);

  constructor(
    private configService: ConfigService,
    private invoiceCache: LruCacheService<IAIInvoice>,
    private voucherCache: LruCacheService<IAIVoucher>,
    private voucherRepository: VoucherRepository,
    private invoiceRepository: InvoiceRepository,
  ) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);

    this.logger.log('GeminiService initialized');
  }

  public getInvoiceStatus(resultId: string): PROGRESS_STATUS {
    const result = this.invoiceCache.get(resultId);
    return result ? result.status : PROGRESS_STATUS.NOT_FOUND;
  }

  public getVoucherStatus(resultId: string): PROGRESS_STATUS {
    const result = this.voucherCache.get(resultId);
    return result ? result.status : PROGRESS_STATUS.NOT_FOUND;
  }

  public getInvoiceResult(resultId: string): IAIInvoice | null {
    const result = this.invoiceCache.get(resultId);
    return result && result.status === PROGRESS_STATUS.SUCCESS
      ? result.value
      : null;
  }

  public getVoucherResult(resultId: string): IAIVoucher | null {
    const result = this.voucherCache.get(resultId);
    return result && result.status === PROGRESS_STATUS.SUCCESS
      ? result.value
      : null;
  }

  public startGenerateInvoice(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    return this.startGenerate(
      imageList,
      this.invoiceCache,
      AiServiceType.INVOICE,
    );
  }

  public startGenerateVoucher(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    return this.startGenerate(
      imageList,
      this.voucherCache,
      AiServiceType.VOUCHER,
    );
  }

  private startGenerate(
    imageList: Express.Multer.File[],
    cache: LruCacheService<IAIInvoice | IAIVoucher>,
    type: AiServiceType,
  ): AccountResultStatus {
    let hashedKey = this.generateHashKey(cache);
    let result: AccountResultStatus;

    if (cache.get(hashedKey)?.value) {
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    } else {
      hashedKey = cache.put(hashedKey, PROGRESS_STATUS.IN_PROGRESS, null);
      this.generateContent(hashedKey, imageList, type);
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    }

    return result;
  }

  private generateHashKey(
    cache: LruCacheService<IAIInvoice | IAIVoucher>,
    fileName?: string,
  ) {
    if (!fileName) {
      fileName = randomUUID();
    }
    const hashedId = cache.hashIdWithTimestamp(fileName);
    return hashedId;
  }

  private async generateContent(
    hashedKey: string,
    imageList: Express.Multer.File[],
    type: AiServiceType,
  ) {
    const prompt = `You're a professional accountant, please help me to fill in the ${type} information below based on the provided invoice image`;

    let result: GenerateContentResult;
    const imageParts = imageList.map((image) => ({
      inlineData: {
        mimeType: image.mimetype,
        data: image.buffer.toString('base64'),
      },
    }));

    try {
      const geminiModel = this.genAI.getGenerativeModel({
        model:
          type === AiServiceType.INVOICE
            ? GEMINI_MODE.INVOICE
            : GEMINI_MODE.VOUCHER,
        generationConfig:
          type === AiServiceType.INVOICE
            ? GEMINI_PROMPT.INVOICE
            : GEMINI_PROMPT.VOUCHER,
      });
      result = await geminiModel.generateContent([prompt, ...imageParts]);
    } catch (error) {
      this.logger.error(
        `${type.charAt(0).toUpperCase() + type.slice(1)} ID: ${hashedKey} LLM Error in generateContent in gemini.service: ${error}`,
      );
      this.getCache(type).put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    try {
      const contentFromGemini = JSON.parse(result.response.text());
      this.logger.log(
        `${type.charAt(0).toUpperCase() + type.slice(1)} ID: ${hashedKey} successfully generated content ${contentFromGemini}`,
      );
      const content = {
        ...contentFromGemini,
        resultId: hashedKey,
      };
      await this.getRepository(type).create(content);
      this.getCache(type).put(hashedKey, PROGRESS_STATUS.SUCCESS, content);
    } catch (error) {
      this.logger.error(
        `${type.charAt(0).toUpperCase() + type.slice(1)} ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.getCache(type).put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }
  }

  private getCache(type: AiServiceType) {
    return type === AiServiceType.INVOICE
      ? this.invoiceCache
      : this.voucherCache;
  }

  private getRepository(type: AiServiceType) {
    return type === AiServiceType.INVOICE
      ? this.invoiceRepository
      : this.voucherRepository;
  }
}
