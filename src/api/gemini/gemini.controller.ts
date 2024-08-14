import {
  Controller,
  Post,
  Body,
  Version,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { ImagePostGeminiDto } from '@/api/gemini/dto/image_post_gemini.dto';
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
            fileType:
              /image\/(jpeg|png|gif|bmp|webp|x-icon|vnd\.microsoft\.icon|tiff)|application\/pdf|image\/x-raw/,
          }),
        ],
      }),
    )
    image: Express.Multer.File,
    @Body() imagePostGeminiDto: ImagePostGeminiDto,
  ) {
    return this.geminiService.uploadImageToGemini(image, imagePostGeminiDto);
  }
}
