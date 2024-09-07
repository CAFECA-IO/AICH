import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { OcrModule } from '@/api/ocr/ocr.module';
import { VouchersModule } from '@/api/vouchers/vouchers.module';
import { AuditReportsModule } from '@/api/audit_reports/audit_reports.module';
import { RagModule } from '@/api/rag/rag.module';
import { InvoiceModule } from '@/api/invoices/invoice.module';
import { BeforeAppStartService } from '@/libs/before_app_start/before_app_start.service';

@Module({
  imports: [
    OcrModule,
    VouchersModule,
    AuditReportsModule,
    RagModule,
    InvoiceModule,
  ],
  controllers: [AppController],
  providers: [AppService, BeforeAppStartService],
})
export class AppModule {}
