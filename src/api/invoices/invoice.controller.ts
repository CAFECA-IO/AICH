import {
  Controller,
  Post,
  Version,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
  Get,
  Param,
  Body,
} from '@nestjs/common';
import { InvoiceService } from '@/api/invoices/invoice.service';
import { Logger } from '@nestjs/common';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccountResultStatus } from '@/interfaces/account';
import { PROGRESS_STATUS } from '@/constants/common';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';
import { IInvoice } from '@/interfaces/invoice';
import { ResponseFormatInterceptor } from '@/libs/utils/interceptor/response_format.interceptor';
import { ImagePostInvoiceDto } from '@/api/invoices/dto/image_post_invoice.dto';

@Controller('invoices')
@UseInterceptors(ResponseFormatInterceptor)
export class InvoiceController {
  private readonly logger = new Logger(InvoiceController.name);

  constructor(private readonly invoiceService: InvoiceService) {
    this.logger.log('InvoiceController initialized');
  }

  /**
   * Info (20240815 - Murky) Post image to invoice and generate IInvoice
   * @param image - The image file to be uploaded, use form-data with key 'image' to post
   * @returns {AccountResultStatus} - The status of the invoice result
   */
  @Post('upload')
  @Version('1')
  @ResponseMessage('Image uploaded to AI successfully')
  @UseInterceptors(FileInterceptor('image'))
  uploadImageToInvoice(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            // Info (20240815 - Murky) mime type support by google vision:
            //https://cloud.google.com/vision/docs/supported-files
            fileType: /image\/(jpeg|png|webp|heic|heif)|application\/pdf/,
          }),
        ],
      }),
    )
    image: Express.Multer.File,
    @Body() imagePostInvoiceDto: ImagePostInvoiceDto,
  ) {
    // Delete Me
    try {
      const resultStatus: AccountResultStatus =
        this.invoiceService.startGenerateInvoice(imagePostInvoiceDto, image);
      return resultStatus;
    } catch (error) {
      this.logger.error(`Error in uploading image to invoice: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  /**
   * Info (20240815 - Murky) Get the process status of the invoice result
   * @param { string }resultId - The ID of the invoice result
   * @returns {PROGRESS_STATUS} - The status of the invoice result
   */
  @Get(':resultId/process_status')
  @Version('1')
  @ResponseMessage('Return process status successfully')
  getProcessStatus(@Param('resultId') resultId: string): PROGRESS_STATUS {
    try {
      const result = this.invoiceService.getInvoiceStatus(resultId);

      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting process status from invoice: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  /**
   * Info (20240815 - Murky) Get the process result of the invoice result
   * @param { string } resultId - The ID of the invoice result
   * @returns {IInvoice} - The invoice JSON from invoice
   */
  @Get(':resultId/result')
  @Version('1')
  @ResponseMessage('return Invoice JSON from invoice Successfully ')
  getProcessResult(@Param('resultId') resultId: string): IInvoice {
    try {
      const result = this.invoiceService.getInvoiceResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting process result from invoice: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
