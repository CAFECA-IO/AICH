import { isStringNumber } from './common';

export interface BalanceSheet {
  reportID: string;
  reportName: string;
  reportStartTime: number;
  reportEndTime: number;
  reportType: string;
  totalAssetsFairValue: string;
  totalLiabilitiesAndEquityFairValue: string;
  assets: AssetDetails;
  nonAssets: FairValueContainer;
  liabilities: LiabilityDetails;
  equity: EquityDetails;
}

export interface AssetDetails {
  fairValue: string;
  details: {
    cryptocurrency: AssetType;
    cashAndCashEquivalent: AssetType;
    accountsReceivable: AssetType;
  };
}

interface LiabilityDetails {
  fairValue: string;
  details: {
    userDeposit: AssetType;
    accountsPayable: AssetType;
  };
}

interface EquityDetails {
  fairValue: string;
  details: {
    retainedEarning: AssetType;
    otherCapitalReserve: AssetType;
  };
}

interface AssetType {
  fairValue: string;
  breakdown: {
    [key: string]: {
      amount: string;
      fairValue: string;
    };
  };
}

interface FairValueContainer {
  fairValue: string;
}

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

export function isAssetDetails(obj: any): obj is AssetDetails {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.fairValue) &&
    isAssetType(obj.details.cryptocurrency) &&
    isAssetType(obj.details.cashAndCashEquivalent) &&
    isAssetType(obj.details.accountsReceivable)
  );
}

export function isLiabilityDetails(obj: any): obj is LiabilityDetails {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    isStringNumber(obj.fairValue) &&
    isAssetType(obj.details.userDeposit) &&
    isAssetType(obj.details.accountsPayable)
  );
}

export function isEquityDetails(obj: any): obj is EquityDetails {
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
