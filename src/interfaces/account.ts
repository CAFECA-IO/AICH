import { VOUCHER_TYPE } from '@/constants/account';
import { PROGRESS_STATUS } from '@/constants/common';

// Info Murky (20240416): Interface
export interface AccountResultStatus {
  resultId: string;
  status: PROGRESS_STATUS;
}

// Info Murky (20240416): Constants
export const eventToVoucherTYPE = {
  income: 'receive' as VOUCHER_TYPE,
  payment: 'expense' as VOUCHER_TYPE,
  transfer: 'transfer' as VOUCHER_TYPE,
};
