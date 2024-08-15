import {
  Controller,
  Post,
  Version,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { Logger } from '@nestjs/common';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('gemini')
export class GeminiController {
  private readonly logger = new Logger(GeminiController.name);

  constructor(private readonly geminiService: GeminiService) {
    this.logger.log('GeminiController initialized');
  }

  @Post('upload')
  @Version('1')
  @ResponseMessage('Image uploaded to OCR successfully')
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
    return this.geminiService.uploadImageToGemini(image);
  }
}
