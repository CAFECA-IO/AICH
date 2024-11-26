import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { OcrModule } from '@/api/ocr/ocr.module';
import { VouchersModule } from '@/api/vouchers/vouchers.module';
import { AuditReportsModule } from '@/api/audit_reports/audit_reports.module';
import { RagModule } from '@/api/rag/rag.module';
import { BeforeAppStartService } from '@/libs/before_app_start/before_app_start.service';
import { AiModule } from '@/api/ai/ai.module';
import { GeminiModule } from '@/api/gemini/gemini.module';
import { PrismaService } from '@/api/prisma/prisma.service';
import { PrismaModule } from '@/api/prisma/prisma.module';
import { InvoiceRepository } from '@/api/repository/invoice.repository';
import { VoucherRepository } from '@/api/repository/voucher.repository';
import { RepositoriesModule } from '@/api/repository/repositories.module';

@Module({
  imports: [
    OcrModule,
    VouchersModule,
    AuditReportsModule,
    RagModule,
    AiModule,
    GeminiModule,
    PrismaModule,
    RepositoriesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    BeforeAppStartService,
    PrismaService,
    InvoiceRepository,
    VoucherRepository,
  ],
})
export class AppModule {}
