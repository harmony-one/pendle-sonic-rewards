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
  amountFormatted: string | null;
  timestamp: Date;
  blockNumber: string;
  transactionHash?: string;
  token: TokenInfo | null;
}

export interface RewardUpdateInfo {
  id: string;
  market: string;
  marketInfo: MarketInfo | null;
  pendlePerSec: string;
  pendlePerSecFormatted: string | null;
  incentiveEndsAt: Date;
  timestamp: Date;
  blockNumber: string;
  transactionHash?: string;
  token: TokenInfo | null;
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
  pendlePrice?: number
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

export interface PositionReward {
  asset: string;
  amount: string;
  value: string;
}

export interface PortfolioItem {
  name: string;
  address: string;
  depositTime: string;
  depositAsset0: string;
  depositAsset1: string;
  depositAmount0: string;
  depositAmount1: string;
  depositValue0: string;
  depositValue1: string;
  depositValue: string;
  rewardAsset0: string;
  rewardAsset1: string;
  rewardAmount0: string;
  rewardAmount1: string;
  rewardValue0: string;
  rewardValue1: string;
  rewardValue: string;
  totalDays: string;
  totalBlocks: string;
  apr: string;
  type: string;
  depositLink: string;
}

export interface MarketState {
  totalPt: bigint;
  totalSy: bigint;
  totalLp: bigint;
  treasury: Address;
  scalarRoot: bigint;
  expiry: bigint;
  lnFeeRateRoot: bigint;
  reserveFeePercent: bigint;
  lastLnImpliedRate: bigint;
}

