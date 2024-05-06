import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcrModule } from './ocr/ocr.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { AuditReportsModule } from './audit_reports/audit_reports.module';

@Module({
  imports: [OcrModule, VouchersModule, AuditReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
