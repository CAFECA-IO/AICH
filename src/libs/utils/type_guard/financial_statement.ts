import { FinancialStatements } from '@/interfaces/audit_report';
import { isBalanceSheet } from '@/libs/utils/type_guard/balance_sheet';
import { isCashFlow } from '@/libs/utils/type_guard/cashflow';
import { isComprehensiveIncome } from '@/libs/utils/type_guard/comprehensive_income';

export function isFinancialStatements(obj: any): obj is FinancialStatements {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isBalanceSheet(obj.balanceSheet) &&
    isComprehensiveIncome(obj.comprehensiveIncome) &&
    isCashFlow(obj.cashFlow)
  );
}
