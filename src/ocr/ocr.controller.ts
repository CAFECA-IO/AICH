import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { OcrService } from './ocr.service';
import type { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async parseInvoice(@UploadedFile() image: Express.Multer.File) {
    // return this.ocrService.parseInvoice(file);
  }
}
