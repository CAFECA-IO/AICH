import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcrModule } from './ocr/ocr.module';
import { VouchersModule } from './vouchers/vouchers.module';

@Module({
  imports: [OcrModule, VouchersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
