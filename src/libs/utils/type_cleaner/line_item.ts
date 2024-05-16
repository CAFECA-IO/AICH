import { ILineItem } from '@/interfaces/line_item';
import { cleanBoolean, cleanNumber } from '@/libs/utils/common';
import { isILineItem } from '@/libs/utils/type_guard/line_item';

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
