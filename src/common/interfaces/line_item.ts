import { cleanBoolean, cleanNumber } from '@/common/utils/common';

export interface ILineItem {
  lineItemIndex: string;
  account: string;
  description: string;
  debit: boolean;
  amount: number;
}

export function isILineItem(obj: ILineItem): obj is ILineItem {
  if (
    typeof obj === 'object' &&
    typeof obj.lineItemIndex === 'string' &&
    typeof obj.account === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.debit === 'boolean' &&
    typeof obj.amount === 'number'
  ) {
    return true;
  }
  return false;
}

export function cleanILineItem(obj: any): ILineItem {
  if (!isILineItem(obj)) {
    throw new Error('Invalid ILineItem');
  }
  return {
    lineItemIndex: obj.lineItemIndex ? obj.lineItemIndex : '',
    account: obj.account ? obj.account : '',
    description: obj.description ? obj.description : '',
    debit: cleanBoolean(obj.debit),
    amount: cleanNumber(obj.amount),
  };
}
