import { Module } from '@nestjs/common';
import { GoogleVisionService } from './google_vision.service';

@Module({
  providers: [GoogleVisionService]
})
export class GoogleVisionModule {}
