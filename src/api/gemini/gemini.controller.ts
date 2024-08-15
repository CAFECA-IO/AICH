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
} from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { Logger } from '@nestjs/common';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccountResultStatus } from '@/interfaces/account';
import { PROGRESS_STATUS } from '@/constants/common';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';
import { IInvoice } from '@/interfaces/invoice';
import { ResponseFormatInterceptor } from '@/libs/utils/interceptor/response_format.interceptor';

@Controller('gemini')
@UseInterceptors(ResponseFormatInterceptor)
export class GeminiController {
  private readonly logger = new Logger(GeminiController.name);

  constructor(private readonly geminiService: GeminiService) {
    this.logger.log('GeminiController initialized');
  }

  /**
   * Post image to Gemini and generate IInvoice
   * @param image - The image file to be uploaded, use form-data with key 'image' to post
   * @returns {AccountResultStatus} - The status of the gemini result
   */
  @Post('upload')
  @Version('1')
  @ResponseMessage('Image uploaded to Gemini successfully')
  @UseInterceptors(FileInterceptor('image'))
  uploadImageToGemini(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            // Info Murky (20240422) mime type support by google vision:
            //https://cloud.google.com/vision/docs/supported-files
            fileType: /image\/(jpeg|png|webp|heic|heif)/,
          }),
        ],
      }),
    )
    image: Express.Multer.File,
    // Info: (20240429) Will be use in next pr.
    // @Body() imagePostGeminiDto: ImagePostGeminiDto,
  ) {
    const resultStatus: AccountResultStatus =
      this.geminiService.startGenerateInvoice(image);
    return resultStatus;
  }

  @Get(':resultId/process_status')
  @Version('1')
  @ResponseMessage('Return process status successfully')
  getProcessStatus(@Param('resultId') resultId: string): PROGRESS_STATUS {
    try {
      const result = this.geminiService.getGeminiStatus(resultId);

      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting process status from gemini: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get(':resultId/result')
  @Version('1')
  @ResponseMessage('return Invoice JSON from Gemini Successfully ')
  getProcessResult(@Param('resultId') resultId: string): IInvoice {
    try {
      const result = this.geminiService.getGeminiResult(resultId);
      return result;
    } catch (error) {
      this.logger.error(
        `ID ${resultId}: Error in getting process result from gemini: ${error}`,
      );
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
