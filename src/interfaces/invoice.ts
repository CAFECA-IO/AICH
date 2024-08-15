import { EVENT_TYPE } from '@/constants/account';
import { IPayment } from '@/interfaces/payment';

export interface IInvoice {
  date: number; // timestamp
  eventType: EVENT_TYPE;
  paymentReason: string;
  description: string;
  vendorOrSupplier: string;
  projectId: number | null;
  project: string | null;
  contractId: number | null;
  contract: string | null;
  payment: IPayment;
}
