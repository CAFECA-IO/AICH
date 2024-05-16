import { EVENT_TYPE } from '@/constants/account';
import { convertDateToTimestamp } from '@/libs/utils/common';
import { isEventType } from '@/libs/utils/type_guard';
import {
  IPartialPaymentForInvoiceUpload,
  IPayment,
  isIPayment,
  isIPartialPaymentForInvoiceUpload,
  cleanIPayment,
} from '@/interfaces/payment';

// IInvoiceWithPaymentMethod Interface
export interface IInvoiceWithPaymentMethod {
  invoiceId: string;
  date: number; // timestamp
  eventType: EVENT_TYPE; // 'income' | 'payment' | 'transfer';
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
  eventType: EVENT_TYPE;
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
    isEventType(data.eventType) &&
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
    isEventType(data.eventType) &&
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
  result.eventType = isEventType(data.eventType)
    ? data.eventType
    : EVENT_TYPE.INCOME;
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
