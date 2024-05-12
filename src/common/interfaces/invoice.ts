import { EventType } from '../types/account';
import { convertDateToTimestamp } from '../utils/common';
import { isEventType } from './account';
import {
  IPartialPaymentForInvoiceUpload,
  IPayment,
  isIPayment,
  isIPartialPaymentForInvoiceUpload,
  cleanPartialPaymentForInvoiceUpload,
} from './payment';

// IInvoiceWithPaymentMethod Interface
export interface IInvoiceWithPaymentMethod {
  invoiceId: string;
  date: number; // timestamp
  eventType: EventType; // 'income' | 'payment' | 'transfer';
  paymentReason: string;
  description: string;
  venderOrSupplyer: string;
  projectId: string;
  contractId: string;
  payment: IPayment;
}

// IInvoice Interface
export interface IInvoice {
  invoiceId: string;
  date: number; // timestamp
  eventType: EventType;
  paymentReason: string;
  description: string;
  venderOrSupplyer: string;
  projectId: string;
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
    typeof data.projectId === 'string' &&
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
    typeof data.projectId === 'string' &&
    typeof data.contractId === 'string' &&
    isIPayment(data.payment)
  );
}

export function cleanIInvoice(data: any): IInvoice {
  return {
    invoiceId: data.invoiceId,
    date: data.date,
    eventType: data.eventType,
    paymentReason: data.paymentReason,
    description: data.description,
    venderOrSupplyer: data.venderOrSupplyer,
    projectId: data.projectId,
    contractId: data.contractId,
    payment: data.payment,
  };
}

// Cleaner
export function cleanInvoiceData(data: any): IInvoice {
  if (!data) {
    throw new Error('Invalid invoice data, data is empty');
  }

  const result: any = {};

  result.invoiceId = data.invoiceId || '';
  (result.date = convertDateToTimestamp(data.date)),
    (result.eventType = isEventType(data.eventType)
      ? data.eventType
      : EventType.Income);
  result.paymentReason = data.paymentReason || '';
  result.description = data.description || '';
  result.venderOrSupplyer = data.venderOrSupplyer || '';
  result.projectId = data.projectId || '';
  result.contractId = data.contractId || '';
  result.payment = cleanPartialPaymentForInvoiceUpload(data.payment);

  if (!isIInvoice(result)) {
    throw new Error('Invalid invoice data');
  }
  return result;
}
