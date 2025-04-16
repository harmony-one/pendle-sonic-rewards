// marketHelper.ts
import { client } from "../../common/web3/client";
import PENDLE_MARKET_ABI from '../web3/abis/PendleMarket.json';
import { Address, formatEther } from "viem";
import { MarketInfo, TokenInfo } from "../types";
import { getTokenInfo } from "../web3/helper";
import config from "../config";

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

export async function getLpPtYield(marketAddress: Address): Promise<number | undefined> {
  try {
    // Get the current market state
    const routerAddress = config.contracts.pendleRouter
    const marketState = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'readState',
      args: [routerAddress]
    }) as any;
    
    // Calculate direct PT yield (what you'd get from just holding PT)
    const impliedRateLn = BigInt(marketState.lastLnImpliedRate.toString());
    const normalizedLnRate = Number(impliedRateLn) / 1e18;
    const directPtYield = (Math.exp(normalizedLnRate) - 1) * 100;
    
    // Extract total PT and SY
    const totalPt = Number(formatEther(BigInt(marketState.totalPt.toString())));
    const totalSy = Number(formatEther(BigInt(marketState.totalSy.toString())));
    
    // Calculate PT ratio in the pool
    const totalAssets = totalPt + totalSy;
    const ptRatio = totalPt / totalAssets;
    
    // Calculate LP PT yield component - direct proportion of the PT ratio
    const lpPtYield = directPtYield * ptRatio;
    
    console.log("LP PT Yield calculation:", {
      directPtYield,
      totalPt,
      totalSy,
      ptRatio,
      lpPtYield,
      uiVsCalculated: {
        calculatedValue: lpPtYield,
        differenceFromUi: lpPtYield - 0.9257 // Using the value from your latest screenshot
      }
    });
    
    return lpPtYield;
  } catch (error) {
    console.error("Error calculating LP PT Yield:", error);
  }
}

// Helper function to estimate impermanent loss factor
// This is a simplified model - the actual calculation in Pendle is more complex
function calculateImpermanentLossFactor(daysToMaturity: number): number {
  // For PT markets, impermanent loss increases as we get closer to maturity
  // This is because PT price converges to 1 as maturity approaches
  // This is a simplified approximation
  if (daysToMaturity <= 0) return 0.1; // Near maturity
  if (daysToMaturity > 365) return 0.4; // Far from maturity
  
  // Linear decrease from 0.4 to 0.1 as we approach maturity
  return 0.1 + (0.3 * daysToMaturity / 365);
}


// Helper function to get time to maturity in days
async function getTimeToMaturity(marketAddress: Address): Promise<number> {
  try {
    // Get the market expiry timestamp from the contract
    const expiry = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'expiry',
    }) as unknown as bigint;
    console.log('FCO expiry', expiry)
    // Convert to number and calculate days remaining
    const expiryTimestamp = Number(expiry) * 1000; // Convert to milliseconds
    const currentTimestamp = Date.now();
    
    // Calculate days to maturity
    const millisecondsToMaturity = Math.max(0, expiryTimestamp - currentTimestamp);
    const daysToMaturity = millisecondsToMaturity / (1000 * 60 * 60 * 24);
    
    return daysToMaturity;
  } catch (error) {
    console.error("Error getting time to maturity:", error);
    
    // Alternative method if the first one fails
    try {
      // Try to extract expiry from market info or token name
      // PT tokens often have expiry date in their name (e.g. PT-wstkscUSD-28MAY2025)
      const marketInfo = await getMarketInfo(marketAddress);
      const ptName = marketInfo.principalToken?.symbol || '';
      
      // Parse the date from token name if possible
      const dateMatch = ptName.match(/(\d{1,2})[A-Z]{3}(\d{4})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const year = parseInt(dateMatch[2]);
        const month = getMonthNumber(dateMatch[0].substring(day.toString().length, day.toString().length + 3));
        
        const expiryDate = new Date(year, month, day);
        const daysToMaturity = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        return Math.max(0, daysToMaturity);
      }
      
      // If we can't extract from name, make an educated guess based on typical market duration
      return 180; // 6 months as a fallback
    } catch (fallbackError) {
      console.error("Fallback method for maturity also failed:", fallbackError);
      return 180; // 6 months as a default
    }
  }
}

// Helper to convert month abbreviation to number
function getMonthNumber(monthAbbr: string): number {
  const months = {
    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
  };
  
  return months[monthAbbr as keyof typeof months] || 0;
}