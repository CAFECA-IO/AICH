import {
  EventType,
  VoucherType,
  PaymentStatusType,
  PaymentPeriodType,
} from '../types/account';
import { ProgressStatus } from '../types/common';
import {
  cleanBoolean,
  cleanNumber,
  convertDateToTimestamp,
} from '../utils/common';

// Info Murky (20240416): Interface
export interface AccountResultStatus {
  resultId: string;
  status: ProgressStatus;
}

export interface AccountInvoiceData {
  date: {
    start_date: number; // timestamp
    end_date: number; // timestamp
  };
  eventType: EventType;
  paymentReason: string;
  description: string;
  venderOrSupplyer: string;
  payment: {
    price: number;
    hasTax: boolean;
    taxPercentage: number;
    hasFee: boolean;
    fee: number;
  };
}

export interface AccountInvoiceWithPaymentMethod extends AccountInvoiceData {
  payment: AccountInvoiceData['payment'] & {
    paymentMethod: string;
    paymentPeriod: PaymentPeriodType;
    installmentPeriod: number;
    paymentStatus: PaymentStatusType;
    alreadyPaidAmount: number;
  };
}

export interface AccountLineItem {
  lineItemIndex: string;
  accounting: string;
  particular: string;
  debit: boolean;
  amount: number;
}

export interface AccountVoucherMetaData {
  date: number;
  voucherType: VoucherType;
  venderOrSupplyer: string;
  description: string;
  totalPrice: number;
  taxPercentage: number;
  fee: number;
  paymentMethod: string;
  paymentPeriod: PaymentPeriodType;
  installmentPeriod: number;
  paymentStatus: PaymentStatusType;
  alreadyPaidAmount: number;
}

export interface AccountVoucher {
  voucherIndex: string;
  metadatas: AccountVoucherMetaData[];
  lineItems: AccountLineItem[];
}

// Info Murky (20240416): Constants
export const eventTypeToVoucherType = {
  income: 'receive' as VoucherType,
  payment: 'expense' as VoucherType,
  transfer: 'transfer' as VoucherType,
};

export const AccountInvoiceDataObjectVersion = {
  date: {
    start_date: 'use YYYY-MM-DD format',
    end_date: 'use YYYY-MM-DD format',
  },
  eventType: "'income' | 'payment' | 'transfer'",
  paymentReason: 'string',
  description: 'string',
  venderOrSupplyer: 'string',
  payment: {
    price: 'number',
    hasTax: 'boolean',
    taxPercentage: 'number',
    hasFee: 'boolean',
    fee: 'number',
  },
};

export const AccountVoucherObjectVersion = {
  voucherIndex: 'string',
  metadatas: [
    {
      date: 'number (timestamp)',
      voucherType: "VoucherType ('receive' | 'expense' | 'transfer')",
      venderOrSupplyer: 'string',
      description: 'string',
      totalPrice: 'number',
      taxPercentage: 'number',
      fee: 'number',
      paymentMethod: 'string',
      paymentPeriod: "PaymentPeriodType ('atOnce' | 'installment')",
      installmentPeriod: 'number',
      paymentStatus: "PaymentStatusType ('paid' | 'unpaid' | 'partial')",
      alreadyPaidAmount: 'number',
    },
  ],
  lineItems: [
    {
      lineItemIndex: 'string',
      accounting: 'string',
      particular: 'string',
      debit: 'boolean',
      amount: 'number',
    },
  ],
};

// Deprecated: Murky(20240429): change to enum
// Info Murky (20240416): Type Guard
// export function isEventType(data: string): data is EventType {
//   return data === 'income' || data === 'payment' || data === 'transfer';
// }

// export function isVoucherType(data: string): data is VoucherType {
//   return data === 'receive' || data === 'expense';
// }

// export function isPaymentStatusType(data: string): data is PaymentStatusType {
//   return data === 'paid' || data === 'unpaid' || data === 'partial';
// }

// export function isPaymentPeriodType(data: string): data is PaymentPeriodType {
//   return data === 'atOnce' || data === 'installment';
// }
export function isEventType(data: any): data is EventType {
  return Object.values(EventType).includes(data);
}

export function isVoucherType(data: any): data is VoucherType {
  return Object.values(VoucherType).includes(data);
}

export function isPaymentStatusType(data: any): data is PaymentStatusType {
  return Object.values(PaymentStatusType).includes(data);
}

export function isPaymentPeriodType(data: any): data is PaymentPeriodType {
  return Object.values(PaymentPeriodType).includes(data);
}

// Info Murky (20240416): Check if data 本來進來就可能是any形式的data，然後我們chec他他有沒有以下屬性
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAccountInvoiceData(data: any): data is AccountInvoiceData {
  // 檢查date是否存在，且start_date和end_date是否為數字
  const validDate =
    data.date &&
    typeof data.date.start_date === 'number' &&
    typeof data.date.end_date === 'number';

  // 檢查eventType是否符合EventType類型（假設EventType為一個字符串的聯合類型）
  const validEventType = isEventType(data.eventType);

  // 檢查其他字符串屬性
  const validPaymentReason = typeof data.paymentReason === 'string';
  const validDescription = typeof data.description === 'string';
  const validVenderOrSupplyer = typeof data.venderOrSupplyer === 'string';

  // 檢查payment對象
  const validPayment =
    data.payment &&
    typeof data.payment.price === 'number' &&
    typeof data.payment.hasTax === 'boolean' &&
    typeof data.payment.taxPercentage === 'number' &&
    typeof data.payment.hasFee === 'boolean' &&
    typeof data.payment.fee === 'number';

  return (
    validDate &&
    validEventType &&
    validPaymentReason &&
    validDescription &&
    validVenderOrSupplyer &&
    validPayment
  );
}

export function isAccountInvoiceWithPaymentMethod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): data is AccountInvoiceWithPaymentMethod {
  return (
    typeof data.payment?.paymentMethod === 'string' &&
    isPaymentPeriodType(data.payment?.paymentPeriod) &&
    typeof data.payment?.installmentPeriod === 'number' &&
    isPaymentStatusType(data.payment?.paymentStatus) &&
    typeof data.payment?.alreadyPaidAmount === 'number' &&
    isAccountInvoiceData(data)
  );
}
// Info Murky (20240416): Check if data 本來進來就可能是any形式的data，然後我們chec他他有沒有以下屬性
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAccountLineItem(data: any): data is AccountLineItem {
  return (
    data &&
    typeof data.lineItemIndex === 'string' &&
    typeof data.accounting === 'string' &&
    typeof data.particular === 'string' &&
    typeof data.debit === 'boolean' &&
    typeof data.amount === 'number'
  );
}

export function isAccountLineItems(data: unknown): data is AccountLineItem[] {
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every(isAccountLineItem);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAccountVoucherMetaData(
  data: any,
): data is AccountVoucherMetaData {
  return (
    data &&
    typeof data.date === 'number' &&
    isVoucherType(data.voucherType) &&
    typeof data.venderOrSupplyer === 'string' &&
    typeof data.description === 'string' &&
    typeof data.totalPrice === 'number' &&
    typeof data.taxPercentage === 'number' &&
    typeof data.fee === 'number' &&
    typeof data.paymentMethod === 'string' &&
    isPaymentPeriodType(data.paymentPeriod) &&
    typeof data.installmentPeriod === 'number' &&
    isPaymentStatusType(data.paymentStatus) &&
    typeof data.alreadyPaidAmount === 'number'
  );
}

// Info Murky (20240416): Check if data 本來進來就可能是any形式的data，然後我們chec他他有沒有以下屬性
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAccountVoucher(data: any): data is AccountVoucher {
  const { voucherIndex, lineItems, metadatas } = data;
  return (
    typeof voucherIndex === 'string' &&
    Array.isArray(metadatas) &&
    metadatas.every(isAccountVoucherMetaData) &&
    Array.isArray(lineItems) &&
    lineItems.every(isAccountLineItem)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanAccountLineItem(rawData: any): AccountLineItem {
  if (Array.isArray(rawData)) {
    throw new Error('Invalid line item data, is array');
  }
  const { accounting, particular, debit, amount } = rawData;

  const today = new Date();
  const cleanedData: AccountLineItem = {
    // Info: Murky this id is for demo, need to refactor
    lineItemIndex:
      today.getFullYear().toString() +
      ('00' + today.getMonth().toString()).slice(-2) +
      ('00' + today.getDate().toString()).slice(-2) +
      Math.floor(Math.random() * 1000).toString(),
    accounting: accounting || '',
    particular: particular || '',
    debit: cleanBoolean(debit),
    amount: cleanNumber(amount),
  };

  if (!isAccountLineItem(cleanedData)) {
    throw new Error('Invalid line item data, not clean');
  }
  return cleanedData;
}
export const AccountLineItemObjectVersion = [
  {
    lineItemIndex: 'string',
    accounting: 'string',
    particular: 'string',
    debit: 'boolean',
    amount: 'number',
  },
];

// Info Murky (20240416): Convert the raw data to the OOO Types object
// Main function to process and convert the invoice data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanInvoiceData(rawData: any): AccountInvoiceData {
  const {
    date,
    eventType,
    paymentReason,
    description,
    venderOrSupplyer,
    payment,
  } = rawData;

  const price = cleanNumber(payment.price);
  // 如果是稅後，需要算出稅率比
  let taxPercentage = payment.taxPercentage
    ? parseFloat(payment.taxPercentage)
    : 5;

  if (taxPercentage > 100) {
    if (taxPercentage > price) {
      taxPercentage = ((taxPercentage - price) / price) * 100;
    } else {
      taxPercentage = ((price - taxPercentage) / taxPercentage) * 100;
    }
  }

  // Construct the new object with the cleaned and converted data
  const cleanedData: AccountInvoiceData = {
    date: {
      start_date: convertDateToTimestamp(date.start_date),
      end_date: convertDateToTimestamp(date.end_date),
    },
    eventType: isEventType(eventType) ? eventType : EventType.Income,
    paymentReason: paymentReason || '',
    description: description || '',
    venderOrSupplyer: venderOrSupplyer || '',
    payment: {
      price,
      hasTax: cleanBoolean(payment?.hasTax),
      taxPercentage,
      hasFee: cleanBoolean(payment?.hasFee),
      fee: payment.fee ? cleanNumber(payment.fee) : 0,
    },
  };

  if (!isAccountInvoiceData(cleanedData)) {
    throw new Error('Invalid invoice data');
  }
  return cleanedData;
}

export function cleanAccountLineItems(rawData: unknown): AccountLineItem[] {
  if (!Array.isArray(rawData)) {
    throw new Error('Invalid line item data');
  }
  return rawData.map((lineItem) => cleanAccountLineItem(lineItem));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanedVoucherMetaData(rawData: any): AccountVoucherMetaData {
  const {
    date,
    voucherType,
    venderOrSupplyer,
    description,
    totalPrice,
    taxPercentage,
    fee,
    paymentMethod,
    paymentPeriod,
    installmentPeriod,
    paymentStatus,
    alreadyPaidAmount,
  } = rawData;

  const cleanedData: AccountVoucherMetaData = {
    date: convertDateToTimestamp(date),
    voucherType: isVoucherType(voucherType) ? voucherType : VoucherType.Receive,
    venderOrSupplyer: venderOrSupplyer || '',
    description: description || '',
    totalPrice: cleanNumber(totalPrice),
    taxPercentage: cleanNumber(taxPercentage),
    fee: cleanNumber(fee),
    paymentMethod: paymentMethod || '',
    paymentPeriod: isPaymentPeriodType(paymentPeriod)
      ? paymentPeriod
      : PaymentPeriodType.AtOnce,
    installmentPeriod: cleanNumber(installmentPeriod),
    paymentStatus: isPaymentStatusType(paymentStatus)
      ? paymentStatus
      : PaymentStatusType.Unpaid,
    alreadyPaidAmount: cleanNumber(alreadyPaidAmount),
  };

  if (!isAccountVoucherMetaData(cleanedData)) {
    throw new Error('Invalid voucher metadata data');
  }
  return cleanedData;
}

// info Murky (20240416): Convert the raw data to the AccountVoucher object
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
export function cleanVoucherData(rawData: any): AccountVoucher {
  const { lineItems, metadatas } = rawData;

  if (!Array.isArray(lineItems)) {
    throw new Error('Invalid line item data');
  }

  if (!Array.isArray(metadatas)) {
    throw new Error('Invalid metadata data');
  }

  const today = new Date();
  const voucherIndex =
    today.getFullYear().toString() +
    ('00' + today.getMonth().toString()).slice(-2) +
    ('00' + today.getDate().toString()).slice(-2) +
    Math.floor(Math.random() * 1000).toString();
  const cleandLineItems = lineItems.map((lineItem) =>
    cleanAccountLineItem(lineItem),
  );

  // prettier-ignore
  const cleanedVoucherMetaDatas: AccountVoucherMetaData[] = metadatas.map((voucherMetaData) => cleanedVoucherMetaData(voucherMetaData));
  return {
    voucherIndex,
    metadatas: cleanedVoucherMetaDatas,
    lineItems: cleandLineItems,
  };
}
