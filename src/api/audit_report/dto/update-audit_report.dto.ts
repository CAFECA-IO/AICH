import { PartialType } from '@nestjs/mapped-types';
import { CreateAuditReportDto } from './create-audit_report.dto';

export class UpdateAuditReportDto extends PartialType(CreateAuditReportDto) {}
