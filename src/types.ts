import { Address } from "viem";

export interface SubgraphReward {
  id: string;
  token: string;
  amount: string;
}

export interface SubgraphMarket {
  id: string;
  address: string;
  principalToken: string;
  createdAt: string;
}

export interface SubgraphRedeemEvent {
  id: string;
  user: string;
  blockTimestamp: string;
  transactionHash: string;
  market: SubgraphMarket;
  rewards: SubgraphReward[];
}

export interface SubgraphResponse {
  data: {
    redeemRewards_collection: SubgraphRedeemEvent[];
  };
}

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}

export interface MarketInfo {
  address: Address;
  principalToken: TokenInfo;
  yieldToken: TokenInfo | null;
  standardizedYield: TokenInfo | null;
  rewardTokens: TokenInfo[];
  createdAt: Date;
}

export interface RewardInfo {
  token: TokenInfo;
  amount: string;
  amountFormatted: string;
}

export interface RedeemEventInfo {
  id: string;
  user: Address;
  timestamp: Date;
  transactionHash: string;
  market: MarketInfo;
  rewards: RewardInfo[];
}