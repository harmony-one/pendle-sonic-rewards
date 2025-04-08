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
  principalToken: TokenInfo | null;
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

export interface MarketRewardInfo {
  id: string;
  market: string;
  marketInfo: MarketInfo;
  amount: string;
  amountFormatted: string;
  timestamp: Date;
  blockNumber: string;
  transactionHash: string;
  token: TokenInfo;
}

export interface RewardUpdateInfo {
  id: string;
  market: string;
  marketInfo: MarketInfo;
  pendlePerSec: string;
  pendlePerSecFormatted: string;
  incentiveEndsAt: Date;
  timestamp: Date;
  blockNumber: string;
  transactionHash: string;
  token: TokenInfo;
}

export interface RewardRateInfo {
  market: string;
  marketInfo: MarketInfo;
  pendlePerSec: string;
  pendlePerSecFormatted: string;
  accumulatedPendle: string;
  accumulatedPendleFormatted: string;
  lastUpdated: Date;
  incentiveEndsAt: Date;
  pendleToken: TokenInfo | null;
  estimatedRewardAPR: string;
}