import { Injectable, Logger } from '@nestjs/common';
import { IInvoice } from '@/interfaces/invoice';
import { ILineItem } from '@/interfaces/line_item';
import { IVoucher } from '@/interfaces/voucher';
import { PROGRESS_STATUS } from '@/constants/common';
import { LANG_CHAIN_SERVICE_OPTIONS } from '@/constants/configs/config';
import { LangChainService } from '@/libs/lang_chain/lang_chain.service';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { isIInvoice } from '@/libs/utils/type_guard/invoice';
import { cleanILineItem } from '@/libs/utils/type_cleaner/line_item';

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);
  private today = new Date();
  private voucherIdxCounter = 1;

  constructor(
    private readonly cache: LruCacheService<IVoucher>,
    private readonly langChainService: LangChainService,
  ) {
    this.logger.log('VouchersService initialized');
  }

  private returnNotSuccessStatus(errorMessage: PROGRESS_STATUS) {
    const hashedKey = this.cache.put(errorMessage, errorMessage, null);
    return {
      id: hashedKey,
      status: errorMessage,
    };
  }

  public generateVoucherFromInvoices(invoices: IInvoice[]): {
    id: string;
    status: PROGRESS_STATUS;
  } {
    // Info Murky (20240512) if no invoice, return invalid
    if (
      !invoices ||
      invoices.length === 0 ||
      !invoices.every((invoice) => isIInvoice(invoice))
    ) {
      return this.returnNotSuccessStatus(PROGRESS_STATUS.INVALID_INPUT);
    }

    const invoiceString = JSON.stringify(invoices);
    let hashedKey = this.cache.hashId(invoiceString);
    if (this.cache.get(hashedKey).value) {
      return {
        id: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    }

    // Info Murky (20240423) this is async function, but we don't await
    // it will be processed in background
    hashedKey = this.cache.put(hashedKey, PROGRESS_STATUS.IN_PROGRESS, null);
    this.invoicesToAccountVoucherData(hashedKey, invoices);
    this.logger.log(`Voucher generation started with id: ${hashedKey}`);
    return {
      id: hashedKey,
      status: PROGRESS_STATUS.IN_PROGRESS,
    };
  }

  public getVoucherAnalyzingStatus(resultId: string): PROGRESS_STATUS {
    const result = this.cache.get(resultId);
    if (!result) {
      return PROGRESS_STATUS.NOT_FOUND;
    }

    return result.status;
  }

  public getVoucherAnalyzingResult(resultId: string): IVoucher | null {
    const result = this.cache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== PROGRESS_STATUS.SUCCESS) {
      return null;
    }

    return result.value;
  }

  private async invoicesToAccountVoucherData(
    hashedId: string,
    invoices: IInvoice[],
  ): Promise<void> {
    try {
      const invoiceString = JSON.stringify(invoices);

      let lineItemsGenerated: any;

      try {
        lineItemsGenerated = await this.langChainService.invoke(
          {
            input: invoiceString,
          },
          { recursionLimit: LANG_CHAIN_SERVICE_OPTIONS.RECURSIVE_LIMIT },
        );

        if (!lineItemsGenerated) {
          const errorMessage = 'line items not generated by LLaMA';
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
      } catch (error) {
        this.logger.error(
          `Error in llama genetateResponseLoop in OCR invoicesToAccountVoucherData: ${error}`,
        );
        this.cache.put(hashedId, PROGRESS_STATUS.LLM_ERROR, null);
        return;
      }

      if (this.today.getDate() !== new Date().getDate()) {
        this.today = new Date();
      }

      try {
        if (lineItemsGenerated?.lineItems) {
          lineItemsGenerated = lineItemsGenerated.lineItems;
        } else if (lineItemsGenerated?.tool_input) {
          lineItemsGenerated = lineItemsGenerated.tool_input;
        }

        lineItemsGenerated as ILineItem[];

        lineItemsGenerated = lineItemsGenerated.map((lineItem: ILineItem) => {
          return cleanILineItem(lineItem);
        });
      } catch (error) {
        this.cache.put(hashedId, PROGRESS_STATUS.LLM_ERROR, null);
        return;
      }
      const voucherGenerated: IVoucher = {
        // Deprecated: (20240523 - Murky) New IVoucher only need lineItems
        // voucherIndex: `${this.today.toISOString().slice(0, 10).replace('-', '')}${this.voucherIdxCounter++}`,
        // metadatas,
        lineItems: lineItemsGenerated,
      };

      if (voucherGenerated) {
        this.cache.put(hashedId, PROGRESS_STATUS.SUCCESS, voucherGenerated);
        this.logger.log(`Voucher generation success with id: ${hashedId}`);
      } else {
        this.cache.put(hashedId, PROGRESS_STATUS.NOT_FOUND, null);
        this.logger.error(`Voucher generation failed with id: ${hashedId}`);
      }
    } catch (error) {
      this.cache.put(hashedId, PROGRESS_STATUS.SYSTEM_ERROR, null);
    }
  }
}
