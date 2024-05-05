import { BalanceSheet, isBalanceSheet } from './balance_sheet';
import { CashFlow, isCashFlow } from './cash_flow';
import {
  ComprehensiveIncome,
  isComprehensiveIncome,
} from './comprehensive_income';

export interface FinancialStatements {
  balanceSheet: BalanceSheet;
  comprehensiveIncome: ComprehensiveIncome;
  cashFlow: CashFlow;
}

//Info Murky (20240505): type guards
export function isFinancialStatements(obj: any): obj is FinancialStatements {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isBalanceSheet(obj.balanceSheet) &&
    isComprehensiveIncome(obj.comprehensiveIncome) &&
    isCashFlow(obj.cashFlow)
  );
}
