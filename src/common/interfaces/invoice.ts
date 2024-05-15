import { EVENT_TYPE } from '@/common/enums/account';
import { convertDateToTimestamp } from '@/common/utils/common';
import { isEVENT_TYPE } from '@/common/interfaces/account';
import {
  IPartialPaymentForInvoiceUpload,
  IPayment,
  isIPayment,
  isIPartialPaymentForInvoiceUpload,
  cleanIPayment,
} from './payment';

// IInvoiceWithPaymentMethod Interface
export interface IInvoiceWithPaymentMethod {
  invoiceId: string;
  date: number; // timestamp
  EVENT_TYPE: EVENT_TYPE; // 'income' | 'payment' | 'transfer';
  paymentReason: string;
  description: string;
  venderOrSupplyer: string;
  projectId: string;
  project: string;
  contractId: string;
  contract: string;
  payment: IPayment;
}

// IInvoice Interface
export interface IInvoice {
  invoiceId: string;
  date: number; // timestamp
  EVENT_TYPE: EVENT_TYPE;
  paymentReason: string;
  description: string;
  venderOrSupplyer: string;
  project: string;
  projectId: string;
  contract: string;
  contractId: string;
  payment: IPartialPaymentForInvoiceUpload;
}
// Info Murky (20240416): Type Guard
//  Check if data 本來進來就可能是any形式的data，然後我們chec他他有沒有以下屬性
export function isIInvoice(data: IInvoice): data is IInvoice {
  return (
    typeof data.invoiceId === 'string' &&
    typeof data.date === 'number' &&
    isEVENT_TYPE(data.EVENT_TYPE) &&
    typeof data.paymentReason === 'string' &&
    typeof data.description === 'string' &&
    typeof data.venderOrSupplyer === 'string' &&
    typeof data.project === 'string' &&
    typeof data.projectId === 'string' &&
    typeof data.contract === 'string' &&
    typeof data.contractId === 'string' &&
    isIPartialPaymentForInvoiceUpload(data.payment)
  );
}

export function isIInvoiceWithPaymentMethod(
  data: IInvoiceWithPaymentMethod,
): data is IInvoiceWithPaymentMethod {
  return (
    typeof data.invoiceId === 'string' &&
    typeof data.date === 'number' &&
    isEVENT_TYPE(data.EVENT_TYPE) &&
    typeof data.paymentReason === 'string' &&
    typeof data.description === 'string' &&
    typeof data.venderOrSupplyer === 'string' &&
    typeof data.project === 'string' &&
    typeof data.projectId === 'string' &&
    typeof data.contract === 'string' &&
    typeof data.contractId === 'string' &&
    isIPayment(data.payment)
  );
}

// Cleaner
export function cleanInvoiceWithPaymentMethod(
  data: any,
): IInvoiceWithPaymentMethod {
  if (!data) {
    throw new Error('Invalid invoice data, data is empty');
  }

  const result: any = {};

  result.invoiceId = data.invoiceId || '';
  result.date = convertDateToTimestamp(data.date);
  result.EVENT_TYPE = isEVENT_TYPE(data.EVENT_TYPE)
    ? data.EVENT_TYPE
    : EVENT_TYPE.Income;
  result.paymentReason = data.paymentReason || '';
  result.description = data.description || '';
  result.venderOrSupplyer = data.venderOrSupplyer || '';
  result.project = data.project || '';
  result.contract = data.contract || '';
  result.projectId = data.projectId || '';
  result.contractId = data.contractId || '';
  result.payment = cleanIPayment(data.payment);

  if (!isIInvoiceWithPaymentMethod(result)) {
    throw new Error('Invalid invoice data');
  }
  return result;
}
