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
import { VouchersService } from '@/api/vouchers/vouchers.service';
import { AccountResultStatus } from '@/interfaces/account';
import { PROGRESS_STATUS } from '@/constants/common';
import { IInvoice } from '@/interfaces/invoice';
import { IVoucher } from '@/interfaces/voucher';
import { ResponseFormatInterceptor } from '@/libs/utils/interceptor/response_format.interceptor';
import { ResponseMessage } from '@/libs/utils/decorator/response_message.decorator';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_MESSAGE } from '@/constants/status_code';

@UseInterceptors(ResponseFormatInterceptor)
@Controller('vouchers')
export class VouchersController {
  private readonly logger = new Logger(VouchersController.name);

  constructor(private readonly vouchersService: VouchersService) {}

  @Post('upload_invoice')
  @Version('1')
  @ResponseMessage('Invoice uploaded to voucher api successfully')
  uploadInvoice(
    @Body()
    invoices: IInvoice[],
  ): AccountResultStatus {
    invoices.map((invoice) => {
      invoice.project = invoice.project || 'None';
      invoice.projectId = invoice.projectId || 'None';
      invoice.contract = invoice.contract || 'None';
      invoice.contractId = invoice.contractId || 'None';
    });

    try {
      const { id, status } =
        this.vouchersService.generateVoucherFromInvoices(invoices);

      const resultStatus = {
        resultId: id,
        status: status,
      };
      return resultStatus;
    } catch (error) {
      this.logger.error(error);
      throw new ResponseException(
        STATUS_MESSAGE.UPLOAD_INVOICE_JSON_TO_VOUCHER_FAILED,
      );
    }
  }

  @Get(':resultId/process_status')
  @Version('1')
  @ResponseMessage('Process status retrieved successfully')
  getProcessStatus(@Param('resultId') resultId: string): PROGRESS_STATUS {
    try {
      const status = this.vouchersService.getVoucherAnalyzingStatus(resultId);

      return status;
    } catch (error) {
      this.logger.error(`Error in getting process status: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_PROCESS_STATUS_FAILED);
    }
  }

  @Get(':resultId/result')
  @Version('1')
  @ResponseMessage('Voucher result retrieved successfully')
  getProcessResult(@Param('resultId') resultId: string): IVoucher {
    try {
      const result = this.vouchersService.getVoucherAnalyzingResult(resultId);

      return result;
    } catch (error) {
      this.logger.error(`Error in getting process result: ${error}`);
      throw new ResponseException(STATUS_MESSAGE.GET_AICH_RESULT_FAILED);
    }
  }
}
