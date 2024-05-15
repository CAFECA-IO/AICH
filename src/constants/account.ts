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
