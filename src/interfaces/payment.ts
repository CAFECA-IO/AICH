import { PAYMENT_PERIOD_TYPE, PAYMENT_STATUS_TYPE } from '@/constants/account';
import { cleanBoolean, cleanNumber } from '@/libs/utils/common';
import { isPaymentPeriodType, isPaymentStatusType } from '@/interfaces/account';

export interface IPayment {
  isRevenue: boolean; // 是否會創造收入，true是錢會進來，false是錢會出去
  price: number; // 總金額
  hasTax: boolean; // 是否含稅
  taxPercentage: number; // 稅率 0 or 5等金額
  hasFee: boolean; // 是否含手續額
  fee: number; // 手續費 金額
  paymentMethod: string; // 錢收進來會付出去的方法
  paymentPeriod: PAYMENT_PERIOD_TYPE; // 是 atOnce 或 installment
  installmentPeriod: number; // 這邊才是填 分期付款有幾期
  paymentAlreadyDone: number; // 已經付了多少錢, 或是收取多少錢
  paymentStatus: PAYMENT_STATUS_TYPE; // 付款狀態
  progress: number; // 這是給contract 使用的， 看contract 實際工作完成了多少%, 不是指付款進度
}

export type IPartialPaymentForInvoiceUpload = Omit<
  IPayment,
  | 'paymentMethod'
  | 'paymentPeriod'
  | 'installmentPeriod'
  | 'paymentStatus'
  | 'paymentAlreadyDone'
  | 'progress'
>;

export function isIPayment(arg: IPayment): arg is IPayment {
  if (
    typeof arg.isRevenue !== 'boolean' ||
    typeof arg.price !== 'number' ||
    typeof arg.hasTax !== 'boolean' ||
    typeof arg.taxPercentage !== 'number' ||
    typeof arg.hasFee !== 'boolean' ||
    typeof arg.fee !== 'number' ||
    typeof arg.paymentMethod !== 'string' ||
    !isPaymentPeriodType(arg.paymentPeriod) ||
    typeof arg.installmentPeriod !== 'number' ||
    typeof arg.paymentAlreadyDone !== 'number' ||
    !isPaymentStatusType(arg.paymentStatus) ||
    typeof arg.progress !== 'number'
  ) {
    return false;
  }
  return true;
}

export function isIPartialPaymentForInvoiceUpload(
  arg: IPartialPaymentForInvoiceUpload,
): arg is IPartialPaymentForInvoiceUpload {
  if (
    typeof arg.isRevenue !== 'boolean' ||
    typeof arg.price !== 'number' ||
    typeof arg.hasTax !== 'boolean' ||
    typeof arg.taxPercentage !== 'number' ||
    typeof arg.hasFee !== 'boolean' ||
    typeof arg.fee !== 'number'
  ) {
    return false;
  }
  return true;
}

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
    : PAYMENT_PERIOD_TYPE.AtOnce;
  result.installmentPeriod = cleanNumber(data.installmentPeriod);
  result.paymentAlreadyDone = cleanNumber(data.paymentAlreadyDone);
  result.paymentStatus = isPaymentStatusType(data.paymentStatus)
    ? data.paymentStatus
    : PAYMENT_STATUS_TYPE.Unpaid;
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

export function cleanPartialPaymentForInvoiceUpload(
  data: any,
): IPartialPaymentForInvoiceUpload {
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
  if (!isIPartialPaymentForInvoiceUpload(result)) {
    throw new Error('Invalid IPayment data');
  }
  return result;
}
