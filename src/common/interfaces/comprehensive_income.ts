import { isStringNumber } from '@/common/interfaces/common';

export type ComprehensiveIncome = {
  reportType: string;
  reportID: string;
  reportName: string;
  reportStartTime: number;
  reportEndTime: number;
  netProfit: string;
  income: Income;
  costs: Costs;
  operatingExpenses: OperatingExpenses;
  financialCosts: FinancialCosts;
  otherGainLosses: OtherGainLosses;
};

export type Income = {
  weightedAverageCost: string;
  details: {
    depositFee: FeeDetail;
    withdrawalFee: FeeDetail;
    tradingFee: FeeDetail;
    spreadFee: FeeDetail;
    liquidationFee: FeeDetail;
    guaranteedStopLossFee: FeeDetail;
  };
};

export type Costs = {
  weightedAverageCost: string;
  details: {
    technicalProviderFee: FeeDetail;
    marketDataProviderFee: SimpleCost;
    newCoinListingCost: SimpleCost;
  };
};

export type OperatingExpenses = {
  weightedAverageCost: string;
  details: {
    salaries: string;
    rent: string;
    marketing: string;
    rebateExpenses: FeeDetail;
  };
};

export type FinancialCosts = {
  weightedAverageCost: string;
  details: {
    interestExpense: string;
    cryptocurrencyForexLosses: FeeDetail;
    fiatToCryptocurrencyConversionLosses: string;
    cryptocurrencyToFiatConversionLosses: string;
    fiatToFiatConversionLosses: string;
  };
};

export type OtherGainLosses = {
  weightedAverageCost: string;
  details: {
    investmentGains: string;
    forexGains: string;
    cryptocurrencyGains: FeeDetail;
  };
};

export type FeeDetail = {
  weightedAverageCost: string;
  breakdown: {
    [currency: string]: {
      amount: string;
      weightedAverageCost: string;
    };
  };
};

export type SimpleCost = {
  weightedAverageCost: string;
};

// type guards
export function isComprehensiveIncome(obj: any): obj is ComprehensiveIncome {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.reportType === 'string' &&
    typeof obj.reportID === 'string' &&
    isStringNumber(obj.reportID) &&
    typeof obj.reportName === 'string' &&
    typeof obj.reportStartTime === 'number' &&
    typeof obj.reportEndTime === 'number' &&
    isStringNumber(obj.netProfit) &&
    isIncome(obj.income) &&
    isCosts(obj.costs) &&
    isOperatingExpenses(obj.operatingExpenses) &&
    isFinancialCosts(obj.financialCosts) &&
    isOtherGainLosses(obj.otherGainLosses)
  );
}

export function isIncome(obj: any): obj is Income {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isFeeDetail(obj.details.depositFee) &&
    isFeeDetail(obj.details.withdrawalFee) &&
    isFeeDetail(obj.details.tradingFee) &&
    isFeeDetail(obj.details.spreadFee) &&
    isFeeDetail(obj.details.liquidationFee) &&
    isFeeDetail(obj.details.guaranteedStopLossFee)
  );
}

export function isCosts(obj: any): obj is Costs {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isFeeDetail(obj.details.technicalProviderFee) &&
    isSimpleCost(obj.details.marketDataProviderFee) &&
    isSimpleCost(obj.details.newCoinListingCost)
  );
}

export function isOperatingExpenses(obj: any): obj is OperatingExpenses {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isStringNumber(obj.details.salaries) &&
    isStringNumber(obj.details.rent) &&
    isStringNumber(obj.details.marketing) &&
    isFeeDetail(obj.details.rebateExpenses)
  );
}

export function isFinancialCosts(obj: any): obj is FinancialCosts {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isStringNumber(obj.details.interestExpense) &&
    isFeeDetail(obj.details.cryptocurrencyForexLosses) &&
    isStringNumber(obj.details.fiatToCryptocurrencyConversionLosses) &&
    isStringNumber(obj.details.cryptocurrencyToFiatConversionLosses) &&
    isStringNumber(obj.details.fiatToFiatConversionLosses)
  );
}

export function isOtherGainLosses(obj: any): obj is OtherGainLosses {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isStringNumber(obj.details.investmentGains) &&
    isStringNumber(obj.details.forexGains) &&
    isFeeDetail(obj.details.cryptocurrencyGains)
  );
}

export function isFeeDetail(obj: any): obj is FeeDetail {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isBreakdown(obj.breakdown)
  );
}

export function isBreakdown(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.keys(obj).every(
    (key) =>
      typeof obj[key] === 'object' &&
      obj[key] !== null &&
      isStringNumber(obj[key].amount) &&
      isStringNumber(obj[key].weightedAverageCost),
  );
}

export function isSimpleCost(obj: any): obj is SimpleCost {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost)
  );
}
