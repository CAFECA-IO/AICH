import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Version,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { APIResponseType } from 'src/common/interfaces/response';
import { AccountResultStatus } from 'src/common/interfaces/account';
import { version } from 'src/common/utils/version';
import { ProgressStatus } from 'src/common/types/common';
import { IInvoiceWithPaymentMethod } from 'src/common/interfaces/invoice';
import { IVoucher } from 'src/common/interfaces/voucher';

@Controller('vouchers')
export class VouchersController {
  private readonly logger = new Logger(VouchersController.name);

  constructor(private readonly vouchersService: VouchersService) {}

  @Post('upload_invoice')
  @Version('1')
  uploadInvoice(
    @Body()
    invoices: IInvoiceWithPaymentMethod[],
  ): APIResponseType<AccountResultStatus> {
    // const invoiceWithPaymentMethod = invoices.map((invoice) => {
    //   return transformDTOToInvoiceWithPaymentMethod(invoice);
    // });

    const { id, status } =
      this.vouchersService.generateVoucherFromInvoices(invoices);
    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Invoice uploaded successfully',
      payload: {
        resultId: id,
        status: status,
      },
    };
  }

  @Get(':resultId/process_status')
  @Version('1')
  getProcessStatus(
    @Param('resultId') resultId: string,
  ): APIResponseType<ProgressStatus> {
    const status = this.vouchersService.getVoucherAnalyzingStatus(resultId);
    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Process status retrieved successfully',
      payload: status,
    };
  }

  @Get(':resultId/result')
  @Version('1')
  getProcessResult(
    @Param('resultId') resultId: string,
  ): APIResponseType<IVoucher | null> {
    const result = this.vouchersService.getVoucherAnalyzingResult(resultId);
    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Process result retrieved successfully',
      payload: result,
    };
  }
}
