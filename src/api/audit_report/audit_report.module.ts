import { Module } from '@nestjs/common';
import { AuditReportService } from './audit_report.service';
import { AuditReportController } from './audit_report.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [AuditReportController],
  providers: [AuditReportService],
})
export class AuditReportModule {}
