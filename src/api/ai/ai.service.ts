import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { AccountResultStatus } from '@/interfaces/account';
import { PROGRESS_STATUS } from '@/constants/common';
import { IInvoice } from '@/interfaces/invoice';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';

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
      const resultStatus: AccountResultStatus =
        this.geminiService.startGenerateInvoice(imageList);
      return resultStatus;
    } catch (error) {
      this.logger.error(`Error in starting invoice generation: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  public async getInvoiceStatus(resultId: string): Promise<PROGRESS_STATUS> {
    try {
      const result = await this.geminiService.getInvoiceStatus(resultId);
      return result;
    } catch (error) {
      this.logger.error(`Error in getting invoice status: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  public getInvoiceResult(resultId: string): IInvoice {
    try {
      const result = this.geminiService.getInvoiceResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(`Error in getting invoice result: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
