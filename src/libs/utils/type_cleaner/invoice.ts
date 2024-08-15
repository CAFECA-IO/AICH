import { EVENT_TYPE } from '@/constants/account';
import { IInvoice } from '@/interfaces/invoice';
import { convertDateToTimestamp } from '@/libs/utils/common';
import { isEventType } from '@/libs/utils/type_guard/account';
import { cleanIPayment } from '@/libs/utils/type_cleaner/payment';
import { isIInvoice } from '@/libs/utils/type_guard/invoice';

export function cleanInvoice(data: any): IInvoice {
  if (!data) {
    throw new Error('Invalid invoice data, data is empty');
  }

  const result: any = {};

  result.date = convertDateToTimestamp(data.date);
  result.eventType = isEventType(data.eventType)
    ? data.eventType
    : EVENT_TYPE.INCOME;
  result.paymentReason = data.paymentReason || '';
  result.description = data.description || '';
  result.vendorOrSupplier = data.vendorOrSupplier || '';
  result.project = data.project || null;
  result.contract = data.contract || null;
  result.projectId = data.projectId || null;
  result.contractId = data.contractId || null;
  result.payment = cleanIPayment(data.payment);

  if (!isIInvoice(result)) {
    throw new Error('Invalid invoice data');
  }
  return result;
}
