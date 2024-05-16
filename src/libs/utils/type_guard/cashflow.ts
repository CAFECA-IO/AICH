import {
  BreakdownCost,
  CashFlow,
  FinancingActivities,
  InvestingActivities,
  OperatingActivities,
  OtherSupplementaryItems,
  SupplementalSchedule,
  WeightedCost,
} from '@/interfaces/cash_flow';
import { isStringNumber } from '@/libs/utils/type_guard/common';

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

function isSupplementalSchedule(obj: any): obj is SupplementalSchedule {
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

function isOtherSupplementaryItems(obj: any): obj is OtherSupplementaryItems {
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

function isOperatingActivities(obj: any): obj is OperatingActivities {
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

function isInvestingActivities(obj: any): obj is InvestingActivities {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost)
  );
}

function isFinancingActivities(obj: any): obj is FinancingActivities {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    Object.keys(obj.details).every((key) => isWeightedCost(obj.details[key]))
  );
}

function isWeightedCost(obj: any): obj is WeightedCost {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost)
  );
}

function isBreakdownCost(obj: any): obj is BreakdownCost {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.weightedAverageCost) &&
    isBreakdown(obj.breakdown)
  );
}

function isBreakdown(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.keys(obj).every(
    (key) =>
      typeof obj[key] === 'object' &&
      obj[key] !== null &&
      isStringNumber(obj[key].amount) &&
      isStringNumber(obj[key].weightedAverageCost),
  );
}
