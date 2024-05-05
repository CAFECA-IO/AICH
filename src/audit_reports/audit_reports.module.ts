import { Module } from '@nestjs/common';
import { AuditReportsService } from './audit_reports.service';
import { AuditReportsController } from './audit_reports.controller';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';
import { AuditReportsHelperModule } from './audit_reports_helper/audit_reports_helper.module';

@Module({
  imports: [
    AuditReportsHelperModule,
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  providers: [AuditReportsService],
  controllers: [AuditReportsController],
})
export class AuditReportsModule {}
