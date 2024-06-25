import { PartialType } from '@nestjs/mapped-types';
import { CreateAuditReportDto } from '@/api/audit_report/dto/create-audit_report.dto';

export class UpdateAuditReportDto extends PartialType(CreateAuditReportDto) {}
