import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerateContentResult,
  GoogleGenerativeAI,
} from '@google/generative-ai';
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
import { GEMINI_MODE, GEMINI_PROMPT } from '@/constants/gemini';

@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(GeminiService.name);

  constructor(
    private configService: ConfigService,
    private invoiceListCache: LruCacheService<IAIInvoice[]>,
    private voucherCache: LruCacheService<IAIVoucher>,
    private voucherRepository: VoucherRepository,
    private invoiceRepository: InvoiceRepository,
  ) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);

    this.logger.log('GeminiService initialized');
  }

  public getInvoiceStatus(resultId: string): PROGRESS_STATUS {
    const result = this.invoiceListCache.get(resultId);
    return result ? result.status : PROGRESS_STATUS.NOT_FOUND;
  }

  public getVoucherStatus(resultId: string): PROGRESS_STATUS {
    const result = this.voucherCache.get(resultId);
    return result ? result.status : PROGRESS_STATUS.NOT_FOUND;
  }

  public getInvoiceResult(resultId: string): IAIInvoice[] | null {
    const result = this.invoiceListCache.get(resultId);
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
    let hashedKey = this.generateHashKey(this.invoiceListCache);
    let result: AccountResultStatus;

    if (this.invoiceListCache.get(hashedKey)?.value) {
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    } else {
      hashedKey = this.invoiceListCache.put(
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

  public startGenerateVoucher(
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
    cache: LruCacheService<IAIInvoice[] | IAIVoucher>,
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
    const prompt = `You're a professional accountant, please help me to fill in the invoice information list below based on the provided invoice images`;

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
      this.invoiceListCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    try {
      const contentFromGemini = JSON.parse(result.response.text());
      this.logger.log(
        `Invoice ID: ${hashedKey} successfully generated content ${JSON.stringify(contentFromGemini)}`,
      );

      if (contentFromGemini && contentFromGemini.invoiceList.length > 0) {
        const contentList: IAIInvoice[] = contentFromGemini.invoiceList.map(
          (invoice: IAIInvoice) => ({
            resultId: hashedKey,
            inputOrOutput:
              invoice.inputOrOutput ?? InvoiceTransactionDirection.INPUT,
            date: invoice.date,
            no: invoice.no ?? '',
            currencyAlias: invoice.currencyAlias ?? CurrencyType.TWD,
            priceBeforeTax: invoice.priceBeforeTax ?? 0,
            taxType: invoice.taxType ?? InvoiceTaxType.TAXABLE,
            taxRatio: invoice.taxRatio ?? 0,
            taxPrice: invoice.taxPrice ?? 0,
            totalPrice: invoice.totalPrice ?? 0,
            type:
              invoice.type ?? InvoiceType.PURCHASE_TRIPLICATE_AND_ELECTRONIC,
            deductible: invoice.deductible ?? false,
            counterpartyName: invoice.counterpartyName ?? '',
          }),
        );

        const invoiceList =
          await this.invoiceRepository.createMany(contentList);
        this.invoiceListCache.put(
          hashedKey,
          PROGRESS_STATUS.SUCCESS,
          invoiceList,
        );
      } else {
        this.logger.warn(`Invoice ID: ${hashedKey} LLM returned empty content`);
        this.invoiceListCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      }
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.invoiceListCache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
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
