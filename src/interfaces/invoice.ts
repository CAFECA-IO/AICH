import { EVENT_TYPE } from '@/constants/account';
import {
  InvoiceTransactionDirection,
  CurrencyType,
  InvoiceTaxType,
  InvoiceType,
} from '@/constants/invoice';
import { IPayment } from '@/interfaces/payment';

export interface IInvoice {
  date: number; // timestamp
  eventType: EVENT_TYPE;
  paymentReason: string;
  description: string;
  vendorOrSupplier: string;
  projectId: number | null;
  project: string | null;
  contractId: number | null;
  contract: string | null;
  payment: IPayment;
}

export interface IAIInvoice {
  resultId: string;

  /**
   * Info: (20241024 - Murky)
   * @description is invoice caused by input or output of money
   */
  inputOrOutput: InvoiceTransactionDirection;

  /**
   * Info: (20241024 - Murky)
   * @description date of invoice, selected by user
   */
  date: number;

  /**
   * Info: (20241024 - Murky)
   * @description 發票號碼
   */
  no: string;

  /**
   * Info: (20241024 - Murky)
   * @description 貨幣別
   */
  currencyAlias: CurrencyType;

  /**
   * Info: (20241024 - Murky)
   * @description 稅前金額
   */
  priceBeforeTax: number;

  /**
   * Info: (20241024 - Murky)
   * @description 應稅或免稅，零稅率包含在應稅
   */
  taxType: InvoiceTaxType;

  /**
   * Info: (20241024 - Murky)
   * @Integer
   * @description 5% will be written as 5
   */
  taxRatio: number;

  /**
   * Info: (20241024 - Murky)
   * @Integer
   * @description amount of consumption tax
   */
  taxPrice: number;

  /**
   * Info: (20241024 - Murky)
   * @Integer
   * @description total price after tax
   */
  totalPrice: number;

  /**
   * Info: (20241024 - Murky)
   * @description 發票種類 來源於國稅局
   */
  type: InvoiceType;

  /**
   * Info: (20241024 - Murky)
   * @description 此Invoice可否抵扣
   */
  deductible: boolean;

  counterPartyName: string;
}
