import {
  Controller,
  Post,
  Version,
  UseInterceptors,
  ParseFilePipe,
  FileTypeValidator,
  Get,
  Param,
  UploadedFiles,
} from '@nestjs/common';
import { AIService } from '@/api/ai/ai.service';
import { Logger } from '@nestjs/common';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AccountResultStatus } from '@/interfaces/account';
import { PROGRESS_STATUS } from '@/constants/common';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';
import { IAIInvoice } from '@/interfaces/invoice';
import { ResponseFormatInterceptor } from '@/libs/utils/interceptor/response_format.interceptor';
import { IAIVoucher } from '@/interfaces/voucher';

@Controller('ai')
@UseInterceptors(ResponseFormatInterceptor)
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(private readonly aiService: AIService) {
    this.logger.log('AIController initialized');
  }

  @Post('certificate')
  @Version('2')
  @ResponseMessage('Image uploaded to AI successfully')
  @UseInterceptors(FilesInterceptor('image'))
  async uploadCertificateImage(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType: /image\/(jpeg|png|webp|heic|heif)|application\/pdf/,
          }),
        ],
      }),
    )
    imageList: Array<Express.Multer.File>,
  ) {
    try {
      const resultStatus: AccountResultStatus =
        await this.aiService.startGenerateInvoice(imageList);
      return resultStatus;
    } catch (error) {
      this.logger.error(`Error in uploading certificate image: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  @Get('certificate/:resultId/process_status')
  @Version('2')
  @ResponseMessage('Return process status successfully')
  async getCertificateProcessStatus(
    @Param('resultId') resultId: string,
  ): Promise<PROGRESS_STATUS> {
    try {
      const result = await this.aiService.getInvoiceStatus(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting certificate process status: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get('certificate/:resultId')
  @Version('2')
  @ResponseMessage('Return Invoice JSON from invoice Successfully')
  getCertificateProcessResult(@Param('resultId') resultId: string): {
    status: PROGRESS_STATUS;
    value: IAIInvoice[] | null;
  } {
    try {
      const result = this.aiService.getInvoiceResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting certificate process result: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }

  @Post('voucher')
  @Version('2')
  @ResponseMessage('Voucher images uploaded to AI successfully')
  @UseInterceptors(FilesInterceptor('image'))
  async uploadVoucherImage(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType: /image\/(jpeg|png|webp|heic|heif)|application\/pdf/,
          }),
        ],
      }),
    )
    imageList: Array<Express.Multer.File>,
  ) {
    try {
      const resultStatus: AccountResultStatus =
        await this.aiService.startGenerateVoucher(imageList);
      return resultStatus;
    } catch (error) {
      this.logger.error(`Error in uploading voucher image: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  @Get('voucher/:resultId/process_status')
  @Version('2')
  @ResponseMessage('Return process status successfully')
  async getVoucherProcessStatus(
    @Param('resultId') resultId: string,
  ): Promise<PROGRESS_STATUS> {
    try {
      const result = await this.aiService.getVoucherStatus(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting voucher process status: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get('voucher/:resultId')
  @Version('2')
  @ResponseMessage('Return Voucher JSON from voucher Successfully')
  getVoucherProcessResult(@Param('resultId') resultId: string): {
    status: PROGRESS_STATUS;
    value: IAIVoucher | null;
  } {
    try {
      const result = this.aiService.getVoucherResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting voucher process result: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
