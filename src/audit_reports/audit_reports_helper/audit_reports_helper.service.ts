import { Injectable, Logger } from '@nestjs/common';
import { FinancialStatements } from 'src/common/interfaces/audit_report';
import { isZero } from 'src/common/utils/common';

@Injectable()
export class AuditReportsHelperService {
  private readonly logger = new Logger(AuditReportsHelperService.name);

  constructor() {}

  public static generateBalanceSheetRatio(fs: FinancialStatements): {
    [key: string]: number;
  } {
    const { balanceSheet } = fs;
    const totalAsset = parseFloat(balanceSheet.assets.fairValue);
    const totalLiabilities = parseFloat(balanceSheet.liabilities.fairValue);
    const totalEquity = parseFloat(balanceSheet.equity.fairValue);
    // Info Murky (20240505): current ratio is current assets divided by current liabilities
    // but all assets are current assets in this case
    // and all liabilities are current liabilities
    const currentRatio = isZero(totalLiabilities)
      ? 0
      : totalAsset / totalLiabilities;

    const leverageRatio = isZero(totalAsset)
      ? 0
      : totalLiabilities / totalAsset;

    const debtToEquityRatio = isZero(totalEquity)
      ? 0
      : totalLiabilities / totalEquity;

    const equityMultiplier = isZero(totalEquity) ? 0 : totalAsset / totalEquity;

    const workingCapital = totalAsset - totalLiabilities;
    return {
      currentRatio,
      leverageRatio,
      debtToEquityRatio,
      equityMultiplier,
      workingCapital,
    };
  }

  public static generateIncomeStatementRatio(fs: FinancialStatements): {
    [key: string]: number;
  } {
    const { balanceSheet, comprehensiveIncome: IS } = fs;
    const totalAsset = parseFloat(balanceSheet.assets.fairValue);
    const totalEquity = parseFloat(balanceSheet.equity.fairValue);
    const netIncome = parseFloat(IS.netProfit);
    const revenue = parseFloat(IS.income.weightedAverageCost);
    const expense = parseFloat(IS.costs.weightedAverageCost);
    const operatingExpense = parseFloat(
      IS.operatingExpenses.weightedAverageCost,
    );

    const ROE = isZero(totalEquity) ? 0 : netIncome / totalEquity;
    const ROA = isZero(totalAsset) ? 0 : netIncome / totalAsset;
    const grossMargin = isZero(revenue)
      ? 0
      : ((revenue - expense) / revenue) * 100;
    const profitMargin = isZero(revenue) ? 0 : (netIncome / revenue) * 100;
    const operatingExpenseRatio = isZero(revenue)
      ? 0
      : (operatingExpense / revenue) * 100;
    return {
      ROE,
      ROA,
      grossMargin,
      profitMargin,
      operatingExpenseRatio,
    };
  }

  public static generateCashFlowStatementRatio(fs: FinancialStatements): {
    [key: string]: number;
  } {
    const { balanceSheet, cashFlow } = fs;
    const totalAsset = parseFloat(balanceSheet.assets.fairValue);

    const totalLiabilities = parseFloat(
      balanceSheet.liabilities.details.userDeposit.fairValue,
    );

    const cashFlowFromOperatingActivities = parseFloat(
      cashFlow.operatingActivities.weightedAverageCost,
    );

    const cashFlowFromInvestingActivities = parseFloat(
      cashFlow.investingActivities.weightedAverageCost,
    );
    const cashFlowFromFinancingActivities = parseFloat(
      cashFlow.financingActivities.weightedAverageCost,
    );

    const freeCashFlow =
      cashFlowFromOperatingActivities - cashFlowFromInvestingActivities;

    // Info Murky (20240505): Operating Cash Flow Ratio
    // Need to use current liabilities instead of total liabilities
    // but current is total liabilities in this case
    const OCFRatio = isZero(totalLiabilities)
      ? 0
      : cashFlowFromOperatingActivities / totalLiabilities;

    // Info Murky (20240505): Free Cash Flow (FCF) how much cash a company generates after using on investment
    const FCFRatio = isZero(cashFlowFromOperatingActivities)
      ? 0
      : freeCashFlow / cashFlowFromOperatingActivities;

    //Info Murky (20240505): Cash Return on Assets (CROA)
    const cashReturnOnAssets = isZero(totalAsset)
      ? 0
      : cashFlowFromOperatingActivities / totalAsset;

    return {
      cashFlowFromOperatingActivities,
      cashFlowFromInvestingActivities,
      cashFlowFromFinancingActivities,
      OCFRatio,
      FCFRatio,
      cashReturnOnAssets,
    };
  }
}
