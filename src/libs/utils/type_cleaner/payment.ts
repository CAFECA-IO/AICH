import { PAYMENT_PERIOD_TYPE, PAYMENT_STATUS_TYPE } from '@/constants/account';
import { IPayment } from '@/interfaces/payment';
import { cleanBoolean, cleanNumber } from '@/libs/utils/common';
import {
  isPaymentPeriodType,
  isPaymentStatusType,
} from '@/libs/utils/type_guard/account';
import { isIPayment } from '@/libs/utils/type_guard/payment';

// cleaner
export function cleanIPayment(data: any): IPayment {
  if (!data) {
    throw new Error('Invalid IPayment data, data is empty');
  }

  const result: any = {};

  result.isRevenue = cleanBoolean(data.isRevenue);
  result.price = cleanNumber(data.price);
  result.hasTax = cleanBoolean(data.hasTax);
  result.taxPercentage = cleanNumber(data.taxPercentage);
  result.hasFee = cleanBoolean(data.hasFee);
  result.fee = cleanNumber(data.fee);
  result.paymentMethod = data.paymentMethod ? data.paymentMethod : '';
  result.paymentPeriod = isPaymentPeriodType(data.paymentPeriod)
    ? data.paymentPeriod
    : PAYMENT_PERIOD_TYPE.AT_ONCE;
  result.installmentPeriod = cleanNumber(data.installmentPeriod);
  result.paymentAlreadyDone = cleanNumber(data.paymentAlreadyDone);
  result.paymentStatus = isPaymentStatusType(data.paymentStatus)
    ? data.paymentStatus
    : PAYMENT_STATUS_TYPE.UNPAID;
  result.progress = cleanNumber(data.progress);

  let taxPercentage = result.taxPercentage
    ? parseFloat(result.taxPercentage)
    : 5;

  if (taxPercentage > 100) {
    if (taxPercentage > result.price) {
      taxPercentage = ((taxPercentage - result.price) / result.price) * 100;
    } else {
      taxPercentage = ((result.price - taxPercentage) / taxPercentage) * 100;
    }
  }

  result.taxPercentage = taxPercentage;

  if (!isIPayment(result)) {
    throw new Error('Invalid IPayment data');
  }
  return result;
}
