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

export interface LiabilityDetails {
  fairValue: string;
  details: {
    userDeposit: AssetType;
    accountsPayable: AssetType;
  };
}

export interface EquityDetails {
  fairValue: string;
  details: {
    retainedEarning: AssetType;
    otherCapitalReserve: AssetType;
  };
}

export interface AssetType {
  fairValue: string;
  breakdown: {
    [key: string]: {
      amount: string;
      fairValue: string;
    };
  };
}

export interface FairValueContainer {
  fairValue: string;
}
