import { Address } from "viem";

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}