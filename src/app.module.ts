import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { OcrModule } from '@/api/ocr/ocr.module';
import { VouchersModule } from '@/api/vouchers/vouchers.module';
import { AuditReportsModule } from '@/api/audit_reports/audit_reports.module';
import { RagModule } from '@/api/rag/rag.module';

@Module({
  imports: [OcrModule, VouchersModule, AuditReportsModule, RagModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
