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
import {
  CurrencyType,
  InvoiceTaxType,
  InvoiceTransactionDirection,
  InvoiceType,
} from '@/constants/invoice';

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
    return this.startGenerateInvoiceProcess(imageList);
  }

  public startGenerateVoucher(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    return this.startGenerateVoucherProcess(imageList);
  }

  private startGenerateInvoiceProcess(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    let hashedKey = this.generateHashKey(this.invoiceCache);
    let result: AccountResultStatus;

    if (this.invoiceCache.get(hashedKey)?.value) {
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

  private startGenerateVoucherProcess(
    imageList: Express.Multer.File[],
  ): AccountResultStatus {
    let hashedKey = this.generateHashKey(this.voucherCache);
    let result: AccountResultStatus;

    if (this.voucherCache.get(hashedKey)?.value) {
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

  private async generateInvoiceContent(
    hashedKey: string,
    imageList: Express.Multer.File[],
  ) {
    const prompt = `You're a professional accountant, please help me to fill in the invoice information below based on the provided invoice image`;

    let result: GenerateContentResult;
    const imageParts = imageList.map((image) => ({
      inlineData: {
        mimeType: image.mimetype,
        data: image.buffer.toString('base64'),
      },
    }));

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
      const contentFromGemini = JSON.parse(result.response.text());
      this.logger.log(
        `Invoice ID: ${hashedKey} successfully generated content ${JSON.stringify(contentFromGemini)}`,
      );
      const content: IAIInvoice = {
        resultId: hashedKey,
        inputOrOutput:
          contentFromGemini.inputOrOutput ?? InvoiceTransactionDirection.INPUT,
        date: contentFromGemini.date,
        no: contentFromGemini.no ?? '',
        currencyAlias: contentFromGemini.currencyAlias ?? CurrencyType.TWD,
        priceBeforeTax: contentFromGemini.priceBeforeTax ?? 0,
        taxType: contentFromGemini.taxType ?? InvoiceTaxType.TAXABLE,
        taxRatio: contentFromGemini.taxRatio ?? 0,
        taxPrice: contentFromGemini.taxPrice ?? 0,
        totalPrice: contentFromGemini.totalPrice ?? 0,
        type:
          contentFromGemini.type ??
          InvoiceType.PURCHASE_TRIPLICATE_AND_ELECTRONIC,
        deductible: contentFromGemini.deductible ?? false,
        counterpartyName: contentFromGemini.counterpartyName ?? '',
      };

      const invoice = await this.invoiceRepository.create(content);
      this.invoiceCache.put(hashedKey, PROGRESS_STATUS.SUCCESS, invoice);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.invoiceCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }
  }

  private async generateVoucherContent(
    hashedKey: string,
    imageList: Express.Multer.File[],
  ) {
    const prompt = `You're a professional accountant, please help me to fill in the voucher information below based on the provided invoice image`;

    let result: GenerateContentResult;
    const imageParts = imageList.map((image) => ({
      inlineData: {
        mimeType: image.mimetype,
        data: image.buffer.toString('base64'),
      },
    }));

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
      const contentFromGemini = JSON.parse(result.response.text());
      this.logger.log(
        `Voucher ID: ${hashedKey} successfully generated content ${JSON.stringify(contentFromGemini)}`,
      );
      const content: IAIVoucher = {
        resultId: hashedKey,
        voucherDate: contentFromGemini.voucherDate,
        type:
          contentFromGemini.type ??
          InvoiceType.PURCHASE_TRIPLICATE_AND_ELECTRONIC,
        note: contentFromGemini.note ?? '',
        counterpartyName: contentFromGemini.counterpartyName ?? '',
        lineItems: contentFromGemini.lineItems ?? [],
      };
      const voucher = await this.voucherRepository.create(content);
      this.voucherCache.put(hashedKey, PROGRESS_STATUS.SUCCESS, voucher);
    } catch (error) {
      this.logger.error(
        `Voucher ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.voucherCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }
  }
}
