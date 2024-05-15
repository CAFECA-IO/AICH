import {
  EVENT_TYPE,
  VOUCHER_TYPE,
  PAYMENT_STATUS_TYPE,
  PAYMENT_PERIOD_TYPE,
} from '@/constants/account';
import { PROGRESS_STATUS } from '@/constants/common';

// Info Murky (20240416): Interface
export interface AccountResultStatus {
  resultId: string;
  status: PROGRESS_STATUS;
}

// Info Murky (20240416): Constants
export const eventToVoucherTYPE = {
  income: 'receive' as VOUCHER_TYPE,
  payment: 'expense' as VOUCHER_TYPE,
  transfer: 'transfer' as VOUCHER_TYPE,
};

export function isEventType(data: any): data is EVENT_TYPE {
  return Object.values(EVENT_TYPE).includes(data);
}

export function isVoucherType(data: any): data is VOUCHER_TYPE {
  return Object.values(VOUCHER_TYPE).includes(data);
}

export function isPaymentStatusType(data: any): data is PAYMENT_STATUS_TYPE {
  return Object.values(PAYMENT_STATUS_TYPE).includes(data);
}

export function isPaymentPeriodType(data: any): data is PAYMENT_PERIOD_TYPE {
  return Object.values(PAYMENT_PERIOD_TYPE).includes(data);
}
