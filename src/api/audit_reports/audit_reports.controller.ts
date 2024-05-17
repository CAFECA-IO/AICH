import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { AuditReportsService } from '@/api/audit_reports/audit_reports.service';
import { AuditReport } from '@/interfaces/audit_report';

import { PROGRESS_STATUS } from '@/constants/common';
import { isFinancialStatements } from '@/libs/utils/type_guard/financial_statement';
import { ResponseFormatInterceptor } from '@/libs/utils/interceptor/response_format.interceptor';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';
import { AccountResultStatus } from '@/interfaces/account';

@UseInterceptors(ResponseFormatInterceptor)
@Controller('audit_reports')
export class AuditReportsController {
  private readonly logger = new Logger(AuditReportsController.name);

  constructor(private readonly auditReportsService: AuditReportsService) {}

  @Post()
  @Version('1')
  @ResponseMessage('Financial statement uploaded to audit report successfully')
  generateAuditReport(@Body() body: unknown): AccountResultStatus {
    if (!isFinancialStatements(body)) {
      throw new ResponseException(STATUS_MESSAGE.INVALID_INPUT);
    }

    try {
      const hashedId = this.auditReportsService.generateAuditReport(body);

      const resultStatus = {
        resultId: hashedId,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
      return resultStatus;
    } catch (error) {
      this.logger.error(error);
      throw new ResponseException(
        STATUS_MESSAGE.UPLOAD_FINANCIAL_STATEMENT_TO_AUDIT_REPORT_FAILED,
      );
    }
  }

  @Get(':resultId/process_status')
  @Version('1')
  @ResponseMessage('Process status retrieved successfully')
  getProcessStatus(@Param('resultId') resultId: string): PROGRESS_STATUS {
    try {
      const status =
        this.auditReportsService.getAuditReportAnalyzingStatus(resultId);

      return status;
    } catch (error) {
      this.logger.error(error);
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get(':resultId/result')
  @Version('1')
  @ResponseMessage('Audit report retrieved successfully')
  getProcessResult(@Param('resultId') resultId: string): AuditReport {
    try {
      const result =
        this.auditReportsService.getAuditReportAnalyzingResult(resultId);

      return result;
    } catch (error) {
      this.logger.error(error);
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
