import { LIFE_CYCLE_TYPE } from '@/constants/audit_report';
import { BalanceSheet } from '@/interfaces/balance_sheet';
import { CashFlow } from '@/interfaces/cash_flow';
import { ComprehensiveIncome } from '@/interfaces/comprehensive_income';

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
