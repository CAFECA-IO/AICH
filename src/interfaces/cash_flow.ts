export interface CashFlow {
  reportType: string;
  reportID: string;
  reportName: string;
  reportStartTime: number;
  reportEndTime: number;
  supplementalScheduleOfNonCashOperatingActivities: SupplementalSchedule;
  otherSupplementaryItems: OtherSupplementaryItems;
  operatingActivities: OperatingActivities;
  investingActivities: InvestingActivities;
  financingActivities: FinancingActivities;
}

export interface SupplementalSchedule {
  weightedAverageCost: string;
  details: {
    cryptocurrenciesPaidToCustomersForPerpetualContractProfits: WeightedCost;
    cryptocurrenciesDepositedByCustomers: BreakdownCost;
    cryptocurrenciesWithdrawnByCustomers: BreakdownCost;
    cryptocurrenciesPaidToSuppliersForExpenses: BreakdownCost;
    cryptocurrencyInflows: BreakdownCost;
    cryptocurrencyOutflows: BreakdownCost;
    purchaseOfCryptocurrenciesWithNonCashConsideration: BreakdownCost;
    disposalOfCryptocurrenciesForNonCashConsideration: BreakdownCost;
    cryptocurrenciesReceivedFromCustomersAsTransactionFees: BreakdownCost;
  };
}

export interface OtherSupplementaryItems {
  details: {
    relatedToNonCash: {
      cryptocurrenciesEndOfPeriod: WeightedCost;
      cryptocurrenciesBeginningOfPeriod: WeightedCost;
    };
    relatedToCash: {
      netIncreaseDecreaseInCashCashEquivalentsAndRestrictedCash: WeightedCost;
      cryptocurrenciesBeginningOfPeriod: WeightedCost;
      cryptocurrenciesEndOfPeriod: WeightedCost;
    };
  };
}

export interface OperatingActivities {
  weightedAverageCost: string;
  details: {
    cashDepositedByCustomers: BreakdownCost;
    cashWithdrawnByCustomers: BreakdownCost;
    purchaseOfCryptocurrencies: WeightedCost;
    disposalOfCryptocurrencies: WeightedCost;
    cashReceivedFromCustomersAsTransactionFee: BreakdownCost;
    cashPaidToSuppliersForExpenses: BreakdownCost;
  };
}

export interface InvestingActivities {
  weightedAverageCost: string;
}

export interface FinancingActivities {
  weightedAverageCost: string;
  details: {
    proceedsFromIssuanceOfCommonStock: WeightedCost;
    longTermDebt: WeightedCost;
    shortTermBorrowings: WeightedCost;
    paymentsOfDividends: WeightedCost;
    treasuryStock: WeightedCost;
  };
}

export interface WeightedCost {
  weightedAverageCost: string;
}

export interface BreakdownCost {
  weightedAverageCost: string;
  breakdown: {
    [key: string]: {
      amount: string;
      weightedAverageCost: string;
    };
  };
}
