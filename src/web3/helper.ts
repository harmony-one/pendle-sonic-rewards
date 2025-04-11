import { Address, getAddress } from "viem";
import { MarketInfo, TokenInfo } from "../types";
import { client } from "./client";
import ERC20_ABI from './abis/erc20.json'
import PENDLE_MARKET_ABI from './abis/PendleMarket.json'
import GAUGE_CONTROLLER_ABI from './abis/GaugeController.json'
import { getContract } from "viem";
import config from "../config";
import coinGeckoService from "./api/coinGecko";

// Cache for token and market information to reduce RPC calls
const tokenCache = new Map<string, TokenInfo>();
const marketCache = new Map<string, MarketInfo>();

/**
 * Fetches token information from the blockchain
 */
export async function getTokenInfo(address: Address): Promise<TokenInfo | null> {
  // Check cache first
  if (!address) {
    return null
  }
  const cacheKey = address.toLowerCase();
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!;
  }

  try {
    // Fetch token details from contract
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'name',
      }),
      client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    const tokenInfo: TokenInfo = {
      address,
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
    };

    // Cache the result
    tokenCache.set(cacheKey, tokenInfo);
    return tokenInfo;
  } catch (error) {
    console.error(`Failed to fetch token info for ${address}:`, error);
    
    // Return a placeholder on error
    const fallbackInfo: TokenInfo = {
      address,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: 18,
    };
    
    tokenCache.set(cacheKey, fallbackInfo);
    return fallbackInfo;
  }
}

/**
 * Fetches market information from the blockchain
 */
export async function getMarketInfo(
  marketAddress: Address,
//  principalTokenAddress: Address
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
    const [syAddress, principalTokenAddress, ytAddress] = marketTokens as Address[]
    
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

    const marketInfo: MarketInfo = {
      address: marketAddress,
      principalToken,
      yieldToken,
      standardizedYield,
      rewardTokens,
      createdAt: new Date(), // This would ideally come from the subgraph
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

export async function getGaugeController() {

  // Create contract instance
  const gaugeController = getContract({
    address: config.contracts.gaugeController as Address,
    abi: GAUGE_CONTROLLER_ABI,
    client: client
  });

  return gaugeController;
}


/**
 * Get the current reward rate from the GaugeController
 */
export async function getCurrentRewardRate(marketAddress: string) {
  const gaugeController = await getGaugeController();
  const rewardData = await gaugeController.read.rewardData([getAddress(marketAddress)]) as [string, string, string, string];
  
  return {
    pendlePerSec: rewardData[0].toString(),
    accumulatedPendle: rewardData[1].toString(),
    lastUpdated: new Date(Number(rewardData[2]) * 1000),
    incentiveEndsAt: new Date(Number(rewardData[3]) * 1000)
  };
}


/**
 * Mock function to get PENDLE token price
 * In a production environment, this would call a price oracle or API
 */
export async function getPendlePrice(): Promise<number> {
  const price = await coinGeckoService.getPendlePrice()
  return price
}

/**
 * Mock function to get market TVL
 * In a production environment, this would call contract methods to calculate actual TVL
 */
export async function getMarketTVL(marketAddress: string): Promise<number> {
  // Mock TVL - in production, you would calculate this based on totalPt, totalSy, and their prices
  // This should be implemented using on-chain data
  
  // For demo purposes, return a mock value (in USD)
  const mockTVLs: {[key: string]: number} = {
    // Add some example market addresses and TVLs
    "0x3F5EA53d1160177445B1898afbB16da111182418": 2450000,
    "0x6e4e95fab7db1f0524b4b0a05f0b9c96380b7dfa": 1250000,
    // Default TVL if the market isn't in our mock data
    "default": 1000000
  };
  
  const normalizedAddress = marketAddress.toLowerCase();
  return mockTVLs[normalizedAddress] || mockTVLs["default"];
}