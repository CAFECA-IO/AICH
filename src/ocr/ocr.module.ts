import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { LlamaModule } from 'src/llama/llama.module';
import { GoogleVisionModule } from 'src/google_vision/google_vision.module';
import { OcrController } from './ocr.controller';

@Module({
  imports: [GoogleVisionModule, LlamaModule],
  providers: [OcrService],
  controllers: [OcrController],
})
export class OcrModule {}
