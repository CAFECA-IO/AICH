import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { OcrModule } from '@/ocr/ocr.module';
import { VouchersModule } from '@/vouchers/vouchers.module';
import { AuditReportsModule } from '@/audit_reports/audit_reports.module';
import { LangChainModule } from '@/lang_chain/lang_chain.module';

@Module({
  imports: [OcrModule, VouchersModule, AuditReportsModule, LangChainModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
