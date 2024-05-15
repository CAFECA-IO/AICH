import { isStringNumber } from '@/common/interfaces/common';

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

// Info Murky (20240505): type guards
export function isCashFlow(obj: any): obj is CashFlow {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.reportType === 'string' &&
    typeof obj.reportID === 'string' &&
    isStringNumber(obj.reportID) &&
    typeof obj.reportName === 'string' &&
    typeof obj.reportStartTime === 'number' &&
    typeof obj.reportEndTime === 'number' &&
    isSupplementalSchedule(
      obj.supplementalScheduleOfNonCashOperatingActivities,
    ) &&
    isOtherSupplementaryItems(obj.otherSupplementaryItems) &&
    isOperatingActivities(obj.operatingActivities) &&
    isInvestingActivities(obj.investingActivities) &&
    isFinancingActivities(obj.financingActivities)
  );
}

export function isSupplementalSchedule(obj: any): obj is SupplementalSchedule {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    Object.keys(obj.details).every(
      (key) =>
        isBreakdownCost(obj.details[key]) || isWeightedCost(obj.details[key]),
    )
  );
}

export function isOtherSupplementaryItems(
  obj: any,
): obj is OtherSupplementaryItems {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ['relatedToNonCash', 'relatedToCash'].every(
      (subKey) =>
        typeof obj.details[subKey] === 'object' &&
        Object.keys(obj.details[subKey]).every((key) =>
          isWeightedCost(obj.details[subKey][key]),
        ),
    )
  );
}

export function isOperatingActivities(obj: any): obj is OperatingActivities {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    Object.keys(obj.details).every(
      (key) =>
        isBreakdownCost(obj.details[key]) || isWeightedCost(obj.details[key]),
    )
  );
}

export function isInvestingActivities(obj: any): obj is InvestingActivities {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost)
  );
}

export function isFinancingActivities(obj: any): obj is FinancingActivities {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    Object.keys(obj.details).every((key) => isWeightedCost(obj.details[key]))
  );
}

export function isWeightedCost(obj: any): obj is WeightedCost {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost)
  );
}

export function isBreakdownCost(obj: any): obj is BreakdownCost {
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
