import { ILineItem } from '@/interfaces/line_item';

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
