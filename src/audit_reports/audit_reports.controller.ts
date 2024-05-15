import { Body, Controller, Get, Param, Post, Version } from '@nestjs/common';
import { AuditReportsService } from './audit_reports.service';
import {
  AuditReport,
  isFinancialStatements,
} from 'src/common/interfaces/audit_report';

import { version } from 'src/common/utils/version';
import { APIResponseType } from 'src/common/interfaces/response';
import { PROGRESS_STATUS } from 'src/common/enums/common';

@Controller('audit_reports')
export class AuditReportsController {
  constructor(private readonly auditReportsService: AuditReportsService) {}

  @Post()
  @Version('1')
  generateAuditReport(@Body() body: unknown) {
    if (!isFinancialStatements(body)) {
      throw new Error('Invalid input');
    }

    const hashedId = this.auditReportsService.generateAuditReport(body);

    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Audit Report uploaded successfully',
      payload: {
        resultId: hashedId,
        status: PROGRESS_STATUS.InProgress,
      },
    };
  }

  @Get(':resultId/process_status')
  @Version('1')
  getProcessStatus(
    @Param('resultId') resultId: string,
  ): APIResponseType<PROGRESS_STATUS> {
    const status =
      this.auditReportsService.getAuditReportAnalyzingStatus(resultId);

    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Process status',
      payload: status,
    };
  }

  @Get(':resultId/result')
  @Version('1')
  getProcessResult(
    @Param('resultId') resultId: string,
  ): APIResponseType<AuditReport | null> {
    const result =
      this.auditReportsService.getAuditReportAnalyzingResult(resultId);
    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Process result retrieved successfully',
      payload: result,
    };
  }
}
