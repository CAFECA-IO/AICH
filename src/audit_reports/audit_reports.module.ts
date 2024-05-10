import { Module } from '@nestjs/common';
import { AuditReportsService } from './audit_reports.service';
import { AuditReportsController } from './audit_reports.controller';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';
import { AuditReportsHelperModule } from './audit_reports_helper/audit_reports_helper.module';
import { LlamaModule } from 'src/llama/llama.module';
import { audit_report_modelfile } from 'src/constants/modelfiles/audit_report_modelfile';
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
