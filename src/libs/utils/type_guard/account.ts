import {
  EVENT_TYPE,
  PAYMENT_PERIOD_TYPE,
  PAYMENT_STATUS_TYPE,
  VOUCHER_TYPE,
} from '@/constants/account';

//Info Murky (20240416): originate from account.ts
export function isEventType(data: any): data is EVENT_TYPE {
  return Object.values(EVENT_TYPE).includes(data);
}

//Info Murky (20240416): originate from account.ts
export function isPaymentPeriodType(data: any): data is PAYMENT_PERIOD_TYPE {
  return Object.values(PAYMENT_PERIOD_TYPE).includes(data);
}

//Info Murky (20240416): originate from account.ts
export function isPaymentStatusType(data: any): data is PAYMENT_STATUS_TYPE {
  return Object.values(PAYMENT_STATUS_TYPE).includes(data);
}

//Info Murky (20240416): originate from account.ts
export function isVoucherType(data: any): data is VOUCHER_TYPE {
  return Object.values(VOUCHER_TYPE).includes(data);
}
