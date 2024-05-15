export enum EVENT_TYPE {
  Income = 'income',
  Payment = 'payment',
  Transfer = 'transfer',
}

export enum VOUCHER_TYPE {
  Receive = 'receive',
  Expense = 'expense',
  Transfer = 'transfer',
}

export enum PAYMENT_STATUS_TYPE {
  Paid = 'paid',
  Unpaid = 'unpaid',
  Partial = 'partial',
}

export enum PAYMENT_PERIOD_TYPE {
  AtOnce = 'atOnce',
  Installment = 'installment',
}
