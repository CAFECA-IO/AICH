import { Module } from '@nestjs/common';
import { AuditReportsService } from '@/api/audit_reports/audit_reports.service';
import { AuditReportsController } from '@/api/audit_reports/audit_reports.controller';
import { LruCacheModule } from '@/libs/lru_cache/lru_cache.module';
import { AuditReportsHelperModule } from '@/api/audit_reports/audit_reports_helper/audit_reports_helper.module';
import { LlamaModule } from '@/libs/llama/llama.module';
import { audit_report_modelfile } from '@/constants/modelfiles/audit_report_modelfile';
@Module({
  imports: [
    AuditReportsHelperModule,
    LlamaModule.forRoot({
      modelName: 'llama_audit_report',
      modelfile: audit_report_modelfile,
      typeCleaner: null,
      retryLimit: 10,
    }),
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  providers: [AuditReportsService],
  controllers: [AuditReportsController],
})
export class AuditReportsModule {}
