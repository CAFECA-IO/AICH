import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  ValidationPipe,
  Version,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import {
  AccountInvoiceDataWithPaymentMethodDTO,
  transformDTOToInvoiceWithPaymentMethod,
} from 'src/common/dtos/invoice.dto';
import { APIResponseType } from 'src/common/interfaces/response';
import {
  AccountResultStatus,
  AccountVoucher,
} from 'src/common/interfaces/account';
import { version } from 'src/common/utils/version';
import { ProgressStatus } from 'src/common/types/common';

@Controller('vouchers')
export class VouchersController {
  private readonly logger = new Logger(VouchersController.name);

  constructor(private readonly vouchersService: VouchersService) {}

  @Post('upload_invoice')
  @Version('1')
  uploadInvoice(
    @Body(new ValidationPipe({ transform: true }))
    invoices: AccountInvoiceDataWithPaymentMethodDTO[],
  ): APIResponseType<AccountResultStatus> {
    const invoiceWithPaymentMethod = invoices.map((invoice) => {
      return transformDTOToInvoiceWithPaymentMethod(invoice);
    });

    const hashedId = this.vouchersService.generateVoucherFromInvoices(
      invoiceWithPaymentMethod,
    );
    return {
      powerby: `powered by AICH ${version}`,
      success: true,
      code: '200',
      message: 'Invoice uploaded successfully',
      payload: {
        resultId: hashedId,
        status: 'inProgress',
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
  ): APIResponseType<AccountVoucher | null> {
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
