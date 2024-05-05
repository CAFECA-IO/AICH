import { Module } from '@nestjs/common';
import { AuditReportsHelperService } from './audit_reports_helper.service';

@Module({
  providers: [AuditReportsHelperService],
  exports: [AuditReportsHelperService],
})
export class AuditReportsHelperModule {}
