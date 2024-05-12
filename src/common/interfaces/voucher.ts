import { VoucherType } from '../types/account';
import { isVoucherType } from './account';
import { ILineItem, isILineItem } from './line_item';
import { IPayment, isIPayment } from './payment';

export interface IVoucherMetaData {
  date: number;
  voucherType: VoucherType;
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
    isVoucherType(arg.voucherType) ||
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
