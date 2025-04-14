// marketHelper.ts
import { client } from "../web3/client";
import PENDLE_MARKET_ABI from '../web3/abis/PendleMarket.json';
import { Address } from "viem";
import { MarketInfo, TokenInfo } from "../types";
import { getTokenInfo } from "../web3/helper";

const marketCache = new Map<string, MarketInfo>();

/**
 * Get all reward tokens for a specific market
 * @param marketAddress Pendle market address
 * @returns Array of reward token addresses
 */
export async function getMarketRewardTokens(marketAddress: Address): Promise<Address[]> {
  try {
    const rewardTokens = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'getRewardTokens',
    }) as Address[];
    
    return rewardTokens;
  } catch (error) {
    console.error(`Error getting reward tokens for market ${marketAddress}:`, error);
    return [];
  }
}

export async function getMarketInfo(
  marketAddress: Address,
  routerAddress?: Address // Optional router address for Sonic network
): Promise<MarketInfo> {
  // Check cache first
  const cacheKey = marketAddress.toLowerCase();
  if (marketCache.has(cacheKey)) {
    return marketCache.get(cacheKey)!;
  }

  try {    
    // Fetch additional market details from contract
    const [rewardTokenAddresses, marketTokens] = await Promise.all([
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'getRewardTokens',
      }).catch(() => [] as Address[]),
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'readTokens',
      }).catch(() => [] as Address[]),
    ]);
    const [syAddress, principalTokenAddress, ytAddress] = marketTokens as Address[];
    
    const principalToken = await getTokenInfo(principalTokenAddress);
    
    // Fetch SY token info if available
    const standardizedYield = syAddress 
      ? await getTokenInfo(syAddress) 
      : null;

    // Fetch YT token info if available
    const yieldToken = ytAddress 
      ? await getTokenInfo(ytAddress) 
      : null;

    // Fetch reward token info
    const rewardTokens: TokenInfo[] = [];
    for (const tokenAddress of (rewardTokenAddresses as Address[])) {
      const tokenInfo = await getTokenInfo(tokenAddress);
      tokenInfo && rewardTokens.push(tokenInfo);
    }

    // Create base market info
    const marketInfo: MarketInfo = {
      address: marketAddress,
      principalToken,
      yieldToken,
      standardizedYield,
      rewardTokens,
      createdAt: new Date(),
    };

    // Cache the result
    marketCache.set(cacheKey, marketInfo);
    return marketInfo;
  } catch (error) {
    console.error(`Failed to fetch market info for ${marketAddress}:`, error);
    const fallbackInfo: MarketInfo = {
      address: marketAddress,
      principalToken: null,
      yieldToken: null,
      standardizedYield: null,
      rewardTokens: [],
      createdAt: new Date(),
    };
    
    marketCache.set(cacheKey, fallbackInfo);
    return fallbackInfo;
  }
}
