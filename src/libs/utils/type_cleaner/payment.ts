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

  const result: IPayment = {
    isRevenue: cleanBoolean(data.isRevenue),
    price: cleanNumber(data.price),
    hasTax: cleanBoolean(data.hasTax),
    taxPercentage: cleanNumber(data.taxPercentage),
    hasFee: cleanBoolean(data.hasFee),
    fee: cleanNumber(data.fee),
    method: data.method ? data.method : '',
    period: isPaymentPeriodType(data.period)
      ? data.period
      : PAYMENT_PERIOD_TYPE.AT_ONCE,
    installmentPeriod: cleanNumber(data.installmentPeriod),
    alreadyPaid: cleanNumber(data.alreadyPaid),
    status: isPaymentStatusType(data.status)
      ? data.status
      : PAYMENT_STATUS_TYPE.UNPAID,
    progress: cleanNumber(data.progress),
  };

  let taxPercentage = result.taxPercentage;

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
