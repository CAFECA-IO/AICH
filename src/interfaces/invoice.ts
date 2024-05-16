import { EVENT_TYPE } from '@/constants/account';
import { convertDateToTimestamp } from '@/libs/utils/common';
import { isEventType } from '@/libs/utils/type_guard/account';
import { IPayment, isIPayment, cleanIPayment } from '@/interfaces/payment';

export interface IInvoice {
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
    isIPayment(data.payment)
  );
}

// Cleaner
export function cleanInvoice(data: any): IInvoice {
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

  if (!isIInvoice(result)) {
    throw new Error('Invalid invoice data');
  }
  return result;
}
