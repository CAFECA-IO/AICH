import { EVENT_TYPE } from '@/constants/account';
import { IPayment } from '@/interfaces/payment';

export interface IInvoice {
  date: number; // timestamp
  eventType: EVENT_TYPE;
  paymentReason: string;
  description: string;
  vendorOrSupplier: string;
  projectId: string;
  project: string;
  contractId: string;
  contract: string;
  payment: IPayment;
}
