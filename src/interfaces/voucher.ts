import { VOUCHER_TYPE } from '@/constants/account';
import { ILineItem } from '@/interfaces/line_item';
import { IPayment } from '@/interfaces/payment';

export interface IVoucherMetaData {
  date: number;
  VOUCHER_TYPE: VOUCHER_TYPE;
  companyId: string;
  companyName: string;
  description: string;
  reason: string;
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
