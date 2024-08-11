import type { Express } from 'express';

import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Logger,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { OcrService } from '@/api/ocr/ocr.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { PROGRESS_STATUS } from '@/constants/common';
import { AccountResultStatus } from '@/interfaces/account';
import { IInvoice } from '@/interfaces/invoice';
import { ResponseFormatInterceptor } from '@/libs/utils/interceptor/response_format.interceptor';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';

@Controller('ocr')
@UseInterceptors(ResponseFormatInterceptor)
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @Version('1')
  @ResponseMessage('Image uploaded to OCR successfully')
  @UseInterceptors(FileInterceptor('image'))
  async uploadInvoice(
    // Info Murky(20240429): UploadedFile decorator is used to get the file from the request, use Multer to parse the file.
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            // Info Murky (20240422) mime type support by google vision:
            //https://cloud.google.com/vision/docs/supported-files
            fileType:
              /image\/(jpeg|png|gif|bmp|webp|x-icon|vnd\.microsoft\.icon|tiff)|application\/pdf|image\/x-raw/,
          }),
        ],
      }),
    )
    image: Express.Multer.File,
    // 需要主動放入 invoiceName, project, projectId, contract, contractId
    @Body() body: any,
  ): Promise<AccountResultStatus> {
    const {
      imageName = 'None',
      project = 'None',
      projectId = -1,
      contract = 'None',
      contractId = -1,
    }: {
      imageName: string;
      project: string;
      projectId: number;
      contract: string;
      contractId: number;
    } = body;

    try {
      const { id, status } = await this.ocrService.extractTextFromImage(
        image,
        imageName,
        project,
        projectId,
        contract,
        contractId,
      );

      const resultStatusArray = {
        resultId: id,
        status: status,
      };
      return resultStatusArray;
    } catch (error) {
      this.logger.error(`Error in uploading image to OCR: ${error}`);
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
      const result = this.ocrService.getOCRStatus(resultId);

      return result;
    } catch (error) {
      this.logger.error(`Error in getting process status: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get(':resultId/result')
  @Version('1')
  @ResponseMessage('return Invoice JSON Successfully ')
  getProcessResult(@Param('resultId') resultId: string): IInvoice {
    try {
      const result = this.ocrService.getOCRResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(`Error in getting process result: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
