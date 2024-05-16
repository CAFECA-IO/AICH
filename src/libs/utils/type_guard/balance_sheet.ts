import {
  AssetDetails,
  AssetType,
  BalanceSheet,
  EquityDetails,
  FairValueContainer,
  LiabilityDetails,
} from '@/interfaces/balance_sheet';
import { isStringNumber } from '@/libs/utils/type_guard/common';

// Info Murky (20240505): type guards
export function isBalanceSheet(obj: any): obj is BalanceSheet {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.reportID === 'string' &&
    typeof obj.reportName === 'string' &&
    typeof obj.reportStartTime === 'number' &&
    typeof obj.reportEndTime === 'number' &&
    typeof obj.reportType === 'string' &&
    isStringNumber(obj.totalAssetsFairValue) &&
    isStringNumber(obj.totalLiabilitiesAndEquityFairValue) &&
    isAssetDetails(obj.assets) &&
    isFairValueContainer(obj.nonAssets) &&
    isLiabilityDetails(obj.liabilities) &&
    isEquityDetails(obj.equity)
  );
}

function isAssetDetails(obj: any): obj is AssetDetails {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.fairValue) &&
    isAssetType(obj.details.cryptocurrency) &&
    isAssetType(obj.details.cashAndCashEquivalent) &&
    isAssetType(obj.details.accountsReceivable)
  );
}

function isLiabilityDetails(obj: any): obj is LiabilityDetails {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.fairValue) &&
    isAssetType(obj.details.userDeposit) &&
    isAssetType(obj.details.accountsPayable)
  );
}

function isEquityDetails(obj: any): obj is EquityDetails {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.fairValue) &&
    isAssetType(obj.details.retainedEarning) &&
    isAssetType(obj.details.otherCapitalReserve)
  );
}

function isAssetType(obj: any): obj is AssetType {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.fairValue) &&
    isBreakdown(obj.breakdown)
  );
}

function isBreakdown(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.values(obj).every(
    (item: any) =>
      typeof item === 'object' &&
      item !== null &&
      isStringNumber(item.amount) &&
      isStringNumber(item.fairValue),
  );
}

function isFairValueContainer(obj: any): obj is FairValueContainer {
  return (
    typeof obj === 'object' && obj !== null && isStringNumber(obj.fairValue)
  );
}
