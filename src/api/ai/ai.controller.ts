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
import { AIService } from '@/api/ai/ai.service';
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

@Controller('ai')
@UseInterceptors(ResponseFormatInterceptor)
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(private readonly aiService: AIService) {
    this.logger.log('AIController initialized');
  }

  @Post('upload')
  @Version('1')
  @ResponseMessage('Image uploaded to AI successfully')
  @UseInterceptors(FileInterceptor('image'))
  uploadImageToInvoice(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType: /image\/(jpeg|png|webp|heic|heif)|application\/pdf/,
          }),
        ],
      }),
    )
    image: Express.Multer.File,
    @Body() imagePostInvoiceDto: ImagePostInvoiceDto,
  ) {
    try {
      const resultStatus: AccountResultStatus =
        this.aiService.startGenerateInvoice(imagePostInvoiceDto, image);
      return resultStatus;
    } catch (error) {
      this.logger.error(`Error in uploading image to invoice: ${error}`);
      throw new ResponseException(
        STATUS_MESSAGE.EXTRACT_INVOICE_FROM_OCR_FAILED,
      );
    }
  }

  @Get(':resultId/process_status')
  @Version('1')
  @ResponseMessage('Return process status successfully')
  getProcessStatus(@Param('resultId') resultId: string): PROGRESS_STATUS {
    try {
      const result = this.aiService.getInvoiceStatus(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting process status from invoice: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get(':resultId/result')
  @Version('1')
  @ResponseMessage('return Invoice JSON from invoice Successfully ')
  getProcessResult(@Param('resultId') resultId: string): IInvoice {
    try {
      const result = this.aiService.getInvoiceResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting process result from invoice: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
