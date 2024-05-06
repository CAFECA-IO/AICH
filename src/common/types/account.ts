// Deprecated: Murky(20240429): change to enum
// export type EventType = 'income' | 'payment' | 'transfer';
// export type VoucherType = 'receive' | 'expense' | 'transfer';
// export type PaymentStatusType = 'paid' | 'unpaid' | 'partial';
// export type PaymentPeriodType = 'atOnce' | 'installment';

export enum EventType {
  Income = 'income',
  Payment = 'payment',
  Transfer = 'transfer',
}

export enum VoucherType {
  Receive = 'receive',
  Expense = 'expense',
  Transfer = 'transfer',
}

export enum PaymentStatusType {
  Paid = 'paid',
  Unpaid = 'unpaid',
  Partial = 'partial',
}

export enum PaymentPeriodType {
  AtOnce = 'atOnce',
  Installment = 'installment',
}
