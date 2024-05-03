import { Injectable, Logger } from '@nestjs/common';
import {
  AccountInvoiceWithPaymentMethod,
  AccountLineItem,
  AccountVoucher,
  AccountVoucherMetaData,
  cleanVoucherData,
  eventTypeToVoucherType,
} from 'src/common/interfaces/account';
import { ProgressStatus } from 'src/common/types/common';
import { LlamaService } from 'src/llama/llama.service';
import { LruCacheService } from 'src/lru_cache/lru_cache.service';

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    private readonly cache: LruCacheService<AccountVoucher>,
    private readonly llamaService: LlamaService<AccountLineItem[]>,
  ) {
    this.logger.log('VouchersService initialized');
  }

  public generateVoucherFromInvoices(
    invoices: AccountInvoiceWithPaymentMethod[],
  ): string {
    const invoiceString = JSON.stringify(invoices);
    const hashedKey = this.cache.hashId(invoiceString);
    if (this.cache.get(hashedKey).value) {
      return `Invoices data already uploaded, use resultId: ${hashedKey} to retrieve the result`;
    }

    // Info Murky (20240423) this is async function, but we don't await
    // it will be processed in background
    this.invoicesToAccountVoucherData(hashedKey, invoices);
    return hashedKey;
  }

  public getVoucherAnalyzingStatus(resultId: string): ProgressStatus {
    const result = this.cache.get(resultId);
    if (!result) {
      return 'notFound';
    }

    return result.status;
  }

  public getVoucherAnalyzingResult(resultId: string): AccountVoucher | null {
    const result = this.cache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== 'success') {
      return null;
    }

    return result.value;
  }

  private async invoicesToAccountVoucherData(
    hashedId: string,
    invoices: AccountInvoiceWithPaymentMethod[],
  ): Promise<void> {
    try {
      const invoiceString = JSON.stringify(invoices);
      const metadatas: AccountVoucherMetaData[] = invoices.map((invoice) => {
        return {
          date: invoice.date.start_date,
          voucherType: eventTypeToVoucherType[invoice.eventType],
          venderOrSupplyer: invoice.venderOrSupplyer,
          description: invoice.description,
          totalPrice: invoice.payment.price,
          taxPercentage: invoice.payment.taxPercentage,
          fee: invoice.payment.fee,
          paymentMethod: invoice.payment.paymentMethod,
          paymentPeriod: invoice.payment.paymentPeriod,
          installmentPeriod: invoice.payment.installmentPeriod,
          paymentStatus: invoice.payment.paymentStatus,
          alreadyPaidAmount: invoice.payment.alreadyPaidAmount,
        };
      });

      let lineItemsGenetaed: AccountLineItem[];

      try {
        lineItemsGenetaed =
          await this.llamaService.genetateResponseLoop(invoiceString);
      } catch (error) {
        this.logger.error(
          `Error in llama genetateResponseLoop in OCR invoicesToAccountVoucherData: ${error}`,
        );
        this.cache.put(hashedId, 'error', null);
        return;
      }

      const voucherGenetaed = cleanVoucherData({
        lineItems: lineItemsGenetaed,
        metadatas,
      });

      if (voucherGenetaed) {
        this.cache.put(hashedId, 'success', voucherGenetaed);
      } else {
        this.cache.put(hashedId, 'notFound', null);
      }
    } catch (error) {
      this.cache.put(hashedId, 'error', null);
    }
  }
}
