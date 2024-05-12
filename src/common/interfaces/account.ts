import {
  EventType,
  VoucherType,
  PaymentStatusType,
  PaymentPeriodType,
} from '../types/account';
import { ProgressStatus } from '../types/common';

// Info Murky (20240416): Interface
export interface AccountResultStatus {
  resultId: string;
  status: ProgressStatus;
}

// Info Murky (20240416): Constants
export const eventTypeToVoucherType = {
  income: 'receive' as VoucherType,
  payment: 'expense' as VoucherType,
  transfer: 'transfer' as VoucherType,
};

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
