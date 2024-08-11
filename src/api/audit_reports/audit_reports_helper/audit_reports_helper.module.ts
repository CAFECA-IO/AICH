import { Module } from '@nestjs/common';
import { AuditReportsHelperService } from '@/api/audit_reports/audit_reports_helper/audit_reports_helper.service';

@Module({
  providers: [AuditReportsHelperService],
  exports: [AuditReportsHelperService],
})
export class AuditReportsHelperModule {}
