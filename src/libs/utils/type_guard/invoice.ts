import { IInvoice } from '@/interfaces/invoice';
import { isEventType } from '@/libs/utils/type_guard/account';
import { isIPayment } from '@/libs/utils/type_guard/payment';

export function isIInvoice(data: IInvoice): data is IInvoice {
  return (
    typeof data.date === 'number' &&
    isEventType(data.eventType) &&
    typeof data.paymentReason === 'string' &&
    typeof data.description === 'string' &&
    typeof data.vendorOrSupplier === 'string' &&
    typeof data.project === 'string' &&
    typeof data.projectId === 'number' &&
    typeof data.contract === 'string' &&
    typeof data.contractId === 'number' &&
    isIPayment(data.payment)
  );
}
