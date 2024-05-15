import { LIFE_CYCLE_TYPE } from '@/constants/audit_report';
import { BalanceSheet, isBalanceSheet } from '@/interfaces/balance_sheet';
import { CashFlow, isCashFlow } from '@/interfaces/cash_flow';
import {
  ComprehensiveIncome,
  isComprehensiveIncome,
} from '@/interfaces/comprehensive_income';

export interface FinancialStatements {
  balanceSheet: BalanceSheet;
  comprehensiveIncome: ComprehensiveIncome;
  cashFlow: CashFlow;
}

export interface AuditReport {
  balanceSheet: {
    balanceSheet: BalanceSheet;
    balanceSheetRatios: { [key: string]: number };
    balanceSheetAnalysis: string;
  };
  comprehensiveIncome: {
    comprehensiveIncome: ComprehensiveIncome;
    comprehensiveIncomeRatios: { [key: string]: number };
    comprehensiveIncomeAnalysis: string;
  };
  cashFlow: {
    cashFlow: CashFlow;
    cashFlowRatios: { [key: string]: number };
    cashFlowAnalysis: string;
  };
  lifeCycle: LIFE_CYCLE_TYPE;
  creditRating: string;
  financialStatementsAnalysis: string;
  summary: string;
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
