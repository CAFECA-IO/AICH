import { IPayment } from '@/interfaces/payment';
import {
  isPaymentPeriodType,
  isPaymentStatusType,
} from '@/libs/utils/type_guard/account';

export function isIPayment(arg: IPayment): arg is IPayment {
  if (
    typeof arg.isRevenue !== 'boolean' ||
    typeof arg.price !== 'number' ||
    typeof arg.hasTax !== 'boolean' ||
    typeof arg.taxPercentage !== 'number' ||
    typeof arg.hasFee !== 'boolean' ||
    typeof arg.fee !== 'number' ||
    typeof arg.method !== 'string' ||
    !isPaymentPeriodType(arg.period) ||
    typeof arg.installmentPeriod !== 'number' ||
    typeof arg.alreadyPaid !== 'number' ||
    !isPaymentStatusType(arg.status) ||
    typeof arg.progress !== 'number'
  ) {
    return false;
  }
  return true;
}
