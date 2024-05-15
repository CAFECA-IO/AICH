import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Version,
} from '@nestjs/common';
import { VouchersService } from '@/vouchers/vouchers.service';
import { APIResponseType } from '@/common/interfaces/response';
import { AccountResultStatus } from '@/common/interfaces/account';
import { version } from '@/common/utils/version';
import { PROGRESS_STATUS } from '@/common/enums/common';
import { IInvoiceWithPaymentMethod } from '@/common/interfaces/invoice';
import { IVoucher } from '@/common/interfaces/voucher';

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
  ): APIResponseType<PROGRESS_STATUS> {
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
