import { VOUCHER_TYPE } from '@/constants/account';
import { isVoucherType } from '@/libs/utils/type_guard/account';
import { ILineItem } from '@/interfaces/line_item';
import { IPayment } from '@/interfaces/payment';
import { isIPayment } from '@/libs/utils/type_guard/payment';
import { isILineItem } from '@/libs/utils/type_guard/line_item';

export interface IVoucherMetaData {
  date: number;
  VOUCHER_TYPE: VOUCHER_TYPE;
  companyId: string;
  companyName: string;
  description: string;
  reason: string; // 從paymentReason改這個
  projectId: string;
  project: string;
  contractId: string;
  contract: string;
  payment: IPayment;
}

export interface IVoucher {
  voucherIndex: string;
  invoiceIndex: string;
  metadatas: IVoucherMetaData[];
  lineItems: ILineItem[];
}

function isIVoucherMetaData(arg: IVoucherMetaData): arg is IVoucherMetaData {
  if (
    typeof arg.date !== 'number' ||
    isVoucherType(arg.VOUCHER_TYPE) ||
    typeof arg.companyId !== 'string' ||
    typeof arg.companyName !== 'string' ||
    typeof arg.description !== 'string' ||
    typeof arg.reason !== 'string' ||
    typeof arg.projectId !== 'string' ||
    typeof arg.project !== 'string' ||
    typeof arg.contractId !== 'string' ||
    typeof arg.contract !== 'string' ||
    isIPayment(arg.payment)
  ) {
    return false;
  }
  return true;
}

export function isIVoucher(arg: IVoucher): arg is IVoucher {
  if (arg.voucherIndex === undefined || arg.invoiceIndex === undefined) {
    return false;
  }
  const isIVoucherMetaDataReturn = arg.metadatas.every(isIVoucherMetaData);
  if (isIVoucherMetaDataReturn) {
    return false;
  }
  const isILineItemReturn = arg.lineItems.every(isILineItem);
  if (!isILineItemReturn) {
    return false;
  }
  return true;
}
