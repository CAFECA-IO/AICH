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
