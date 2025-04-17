export interface MerklCampaign {
  id: string;
  computeChainId: number;
  distributionChainId: number;
  campaignId: string;
  type: string;
  distributionType: string;
  subType: number;
  rewardTokenId: string;
  amount: string;
  opportunityId: string;
  startTimestamp: number;
  endTimestamp: number;
  creatorAddress: string;
  params: {
    url: string;
    jsonUrl: string;
    duration: number;
    symbolRewardToken: string;
    decimalsRewardToken: number;
    [key: string]: any;
  };
  rewardToken: {
    id: string;
    name: string;
    chainId: number;
    address: string;
    decimals: number;
    symbol: string;
    price?: number;
  };
  campaignStatus: {
    status: string;
  };
}