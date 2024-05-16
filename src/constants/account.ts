export enum EVENT_TYPE {
  INCOME = 'income',
  PAYMENT = 'payment',
  TRANSFER = 'transfer',
}

export enum VOUCHER_TYPE {
  RECEIVE = 'receive',
  EXPENSE = 'expense',
  TRANSFER = 'transfer',
}

export enum PAYMENT_STATUS_TYPE {
  PAID = 'paid',
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
}

export enum PAYMENT_PERIOD_TYPE {
  AT_ONCE = 'atOnce',
  INSTALLMENT = 'installment',
}

export const EVENT_TYPE_TO_VOUCHER_TYPE_MAP: {
  [key in EVENT_TYPE]: VOUCHER_TYPE;
} = {
  [EVENT_TYPE.INCOME]: VOUCHER_TYPE.RECEIVE,
  [EVENT_TYPE.PAYMENT]: VOUCHER_TYPE.EXPENSE,
  [EVENT_TYPE.TRANSFER]: VOUCHER_TYPE.TRANSFER,
};
