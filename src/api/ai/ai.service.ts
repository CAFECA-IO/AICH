import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { AccountResultStatus } from '@/interfaces/account';
import { PROGRESS_STATUS } from '@/constants/common';
import { IAIInvoice } from '@/interfaces/invoice';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';
import { IAIVoucher } from '@/interfaces/voucher';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(private readonly geminiService: GeminiService) {
    this.logger.log('AIService initialized');
  }

  public async startGenerateInvoice(
    imageList: Express.Multer.File[],
  ): Promise<AccountResultStatus> {
    try {
      return this.geminiService.startGenerateInvoice(imageList);
    } catch (error) {
      this.logger.error(`Error in starting invoice generation: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  public async startGenerateVoucher(
    imageList: Express.Multer.File[],
  ): Promise<AccountResultStatus> {
    try {
      return this.geminiService.startGenerateVoucher(imageList);
    } catch (error) {
      this.logger.error(`Error in starting voucher generation: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  public async getInvoiceStatus(resultId: string): Promise<PROGRESS_STATUS> {
    try {
      return this.geminiService.getInvoiceStatus(resultId);
    } catch (error) {
      this.logger.error(`Error in getting invoice status: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  public async getVoucherStatus(resultId: string): Promise<PROGRESS_STATUS> {
    try {
      return this.geminiService.getVoucherStatus(resultId);
    } catch (error) {
      this.logger.error(`Error in getting voucher status: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  public getInvoiceResult(resultId: string): IAIInvoice[] {
    try {
      const result = this.geminiService.getInvoiceResult(resultId);
      if (!result) {
        throw new Error('Result not found');
      }
      return result;
    } catch (error) {
      this.logger.error(`Error in getting invoice result: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }

  public getVoucherResult(resultId: string): IAIVoucher {
    try {
      const result = this.geminiService.getVoucherResult(resultId);
      if (!result) {
        throw new Error('Result not found');
      }
      return result;
    } catch (error) {
      this.logger.error(`Error in getting voucher result: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
