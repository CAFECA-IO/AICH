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
import { OcrService } from './ocr.service';
import type { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { APIResponseType } from 'src/common/interfaces/response';
import { version } from 'src/common/utils/version';
import { ProgressStatus } from 'src/common/types/common';
import {
  AccountInvoiceData,
  AccountResultStatus,
} from 'src/common/interfaces/account';

@Controller('ocr')
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @Version('1')
  @UseInterceptors(FileInterceptor('image'))
  async uploadInvoice(
    // Info Murky(20240429): UploadedFile decorator is used to get the file from the request, use Multer to parse the file.
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            // Info Murky (20240422) mime type support by google bision:
            //https://cloud.google.com/vision/docs/supported-files
            fileType:
              /image\/(jpeg|png|gif|bmp|webp|x-icon|vnd\.microsoft\.icon|tiff)|application\/pdf|image\/x-raw/,
          }),
        ],
      }),
    )
    image: Express.Multer.File,
    @Body('imageName') imageName: string,
  ): Promise<APIResponseType<AccountResultStatus[]>> {
    try {
      const hasedId = await this.ocrService.extractTextFromImage(
        image,
        imageName,
      );
      return {
        powerby: `powered by AICH ${version}`,
        success: true,
        code: '200',
        message: 'Image uploaded to OCR successfully',
        payload: [
          {
            resultId: hasedId,
            status: 'inProgress',
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Error in uploading image to OCR: ${error}`);
      return {
        powerby: `powered by AICH ${version}`,
        success: false,
        code: '500',
        message: 'Internal server error, upload image to OCR failed',
      };
    }
  }

  @Get(':resultId/process_status')
  @Version('1')
  getProcessStatus(
    @Param('resultId') resultId: string,
  ): APIResponseType<ProgressStatus> {
    const result = this.ocrService.getOCRStatus(resultId);

    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'OCR process status',
      payload: result,
    };
  }

  @Get(':resultId/result')
  @Version('1')
  getProcessResult(
    @Param('resultId') resultId: string,
  ): APIResponseType<AccountInvoiceData | null> {
    const result = this.ocrService.getOCRResult(resultId);
    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'OCR process result',
      payload: result,
    };
  }
}
