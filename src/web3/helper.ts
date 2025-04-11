import { Address, formatUnits, getAddress, parseUnits } from "viem";
import { MarketInfo, PortfolioItem, TokenInfo } from "../types";
import { client } from "./client";
import ERC20_ABI from './abis/erc20.json'
import PENDLE_MARKET_ABI from './abis/PendleMarket.json'
import GAUGE_CONTROLLER_ABI from './abis/GaugeController.json'
import { getContract } from "viem";
import config from "../config";
import moment from "moment";

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
// export async function getMarketInfo(
//   marketAddress: Address,
// //  principalTokenAddress: Address
// ): Promise<MarketInfo> {
//   // Check cache first
//   const cacheKey = marketAddress.toLowerCase();
//   if (marketCache.has(cacheKey)) {
//     return marketCache.get(cacheKey)!;
//   }

//   try {    
//     // Fetch additional market details from contract
//     const [rewardTokenAddresses, marketTokens] = await Promise.all([
//       client.readContract({
//         address: marketAddress,
//         abi: PENDLE_MARKET_ABI,
//         functionName: 'getRewardTokens',
//       }).catch(() => [] as Address[]),
//       client.readContract({
//         address: marketAddress,
//         abi: PENDLE_MARKET_ABI,
//         functionName: 'readTokens',
//       }).catch(() => [] as Address[]),
//     ]);
//     const [syAddress, principalTokenAddress, ytAddress] = marketTokens as Address[]
    
//     const principalToken = await getTokenInfo(principalTokenAddress);

//     // Fetch SY token info if available
//     const standardizedYield = syAddress 
//       ? await getTokenInfo(syAddress) 
//       : null;

//     // Fetch YT token info if available
//     const yieldToken = ytAddress 
//       ? await getTokenInfo(ytAddress) 
//       : null;

//     // Fetch reward token info
//     const rewardTokens: TokenInfo[] = [];
//     for (const tokenAddress of (rewardTokenAddresses as Address[])) {
//       const tokenInfo = await getTokenInfo(tokenAddress);
//       tokenInfo && rewardTokens.push(tokenInfo);
//     }

//     const marketInfo: MarketInfo = {
//       address: marketAddress,
//       principalToken,
//       yieldToken,
//       standardizedYield,
//       rewardTokens,
//       createdAt: new Date(), // This would ideally come from the subgraph
//     };

//     // Cache the result
//     marketCache.set(cacheKey, marketInfo);
//     return marketInfo;
//   } catch (error) {
//     console.error(`Failed to fetch market info for ${marketAddress}:`, error);
//     const fallbackInfo: MarketInfo = {
//       address: marketAddress,
//       principalToken: null,
//       yieldToken: null,
//       standardizedYield: null,
//       rewardTokens: [],
//       createdAt: new Date(),
//     };
    
//     marketCache.set(cacheKey, fallbackInfo);
//     return fallbackInfo;
//   }
// }

export async function calculatePtPriceFromMarketState(marketAddress: Address, routerAddress: Address) {
  try {
    // Get market tokens and information
    console.log("Getting market tokens from:", marketAddress);
    const tokens = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'readTokens',
    }) as [Address, Address, Address]; // [SY, PT, YT]
    
    console.log("Market tokens:", {
      syAddress: tokens[0],
      ptAddress: tokens[1],
      ytAddress: tokens[2]
    });
    
    const ptTokenAddress = tokens[1];
    
    // Get PT and SY tokens info
    console.log("Getting token decimals...");
    const [ptDecimals, syDecimals] = await Promise.all([
      client.readContract({
        address: ptTokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      client.readContract({
        address: tokens[0], // SY address
        abi: ERC20_ABI,
        functionName: 'decimals',
      })
    ]);
    
    console.log("Token decimals:", {
      ptDecimals,
      syDecimals
    });
    
    // Get market state
    console.log("Getting market state with router:", routerAddress);
    const marketState = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'readState',
      args: [routerAddress]
    }) as any;
    
    // Extract totalPt and totalSy from market state (raw BigInt values)
    const totalPt = marketState.totalPt;
    const totalSy = marketState.totalSy;
    
    console.log("Raw market state values:", {
      totalPt: totalPt.toString(),
      totalSy: totalSy.toString(),
      expiry: marketState.expiry.toString(),
      treasury: marketState.treasury
    });
    
    // Convert to decimal values
    const totalPtDecimal = Number(totalPt) / Math.pow(10, Number(ptDecimals));
    const totalSyDecimal = Number(totalSy) / Math.pow(10, Number(syDecimals));
    
    console.log("Converted decimal values:", {
      totalPtDecimal,
      totalSyDecimal,
      ratio: totalSyDecimal / totalPtDecimal
    });
    
    // Estimate PT price based on totalSy/totalPt ratio
    const expiry = Number(marketState.expiry);
    const currentTime = Math.floor(Date.now() / 1000);
    
    console.log("Time calculations:", {
      currentTime,
      expiry,
      secondsToMaturity: Math.max(0, expiry - currentTime),
      daysToMaturity: Math.max(0, expiry - currentTime) / (60 * 60 * 24)
    });
    
    let ptPrice;
    
    if (totalPtDecimal > 0 && totalSyDecimal > 0) {
      // Calculate implied exchange rate
      ptPrice = totalSyDecimal / totalPtDecimal;
      console.log("Initial PT price calculation (SY/PT ratio):", ptPrice);
      
      // Price adjustments based on time to maturity
      // As we get closer to maturity, PT price approaches 1.0
      const secondsToMaturity = Math.max(0, expiry - currentTime);
      const yearsToMaturity = secondsToMaturity / (365 * 24 * 60 * 60);
      
      console.log("Time adjustment factors:", {
        yearsToMaturity,
        linearFactor: Math.min(1, yearsToMaturity * 2)
      });
      
      // Apply a simple model where price approaches 1.0 at maturity
      if (yearsToMaturity > 0) {
        // Adjust price based on time to maturity
        const timeAdjustedPrice = 1.0 - (1.0 - ptPrice) * Math.min(1, yearsToMaturity * 2);
        console.log("Time-adjusted price calculation:", {
          formula: "1.0 - (1.0 - ptPrice) * Math.min(1, yearsToMaturity * 2)",
          result: timeAdjustedPrice
        });
        
        ptPrice = Math.max(ptPrice, timeAdjustedPrice);
        console.log("Final PT price after time adjustment:", ptPrice);
      } else {
        // At or past maturity, PT price should be very close to 1.0
        ptPrice = 1.0;
        console.log("At or past maturity, setting PT price to 1.0");
      }
    } else {
      // Fallback to a reasonable estimate
      ptPrice = 0.95;
      console.log("Using fallback PT price (0.95) due to zero values in totalPt or totalSy");
    }
    
    return ptPrice;
  } catch (error) {
    console.error("Error calculating PT price from market state:", error);
    console.error("Stack trace:", error.stack);
    return 0.95; // Conservative default
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
 * Calculates APR based on deposit amount, rewards, and days elapsed
 */
export const calculateAPR = (
  depositedTotalUSD: number,
  totalRewardsUSD: number,
  daysElapsed: number
) => {
  if (depositedTotalUSD <= 0 || totalRewardsUSD < 0) {
    throw new Error("Deposited total must be positive and rewards cannot be negative.");
  }

  if (daysElapsed <= 0) {
    throw new Error("End date must be after the pool launch date.");
  }

  const returnRate = totalRewardsUSD / depositedTotalUSD;
  const annualizedRate = returnRate * (365 / daysElapsed);
  const apr = annualizedRate * 100;

  return Number(apr.toFixed(2));
}

/**
 * Factory function to create an empty portfolio item
 */
export const portfolioItemFactory = (): PortfolioItem => {
  return {
    name: '',
    address: '',
    depositTime: '',
    depositAsset0: '',
    depositAsset1: '',
    depositAmount0: '',
    depositAmount1: '',
    depositValue0: '',
    depositValue1: '',
    depositValue: '',
    rewardAsset0: '',
    rewardAsset1: '',
    rewardAmount0: '',
    rewardAmount1: '',
    rewardValue0: '',
    rewardValue1: '',
    rewardValue: '',
    totalDays: '',
    totalBlocks: '',
    apr: '',
    type: '',
    depositLink: ''
  }
}

/**
 * Rounds a number string to a specified number of significant digits
 */
export const roundToSignificantDigits = (
  numStr: string,
  n = 6
) => {
  if (!numStr || isNaN(Number(numStr)) || !Number.isInteger(n) || n <= 0) {
    throw new Error('Invalid input: numStr must be a valid number string and n must be a positive integer');
  }

  const num = Number(numStr);

  if (num === 0) {
    return '0.' + '0'.repeat(n); // Returns "0.000..." with n zeros after decimal
  }

  const absNum = Math.abs(num);
  const magnitude = Math.floor(Math.log10(absNum));

  const scale = Math.pow(10, n - magnitude - 1);

  const rounded = Math.round(absNum * scale) / scale;

  const result = num < 0 ? -rounded : rounded;

  // Convert to full decimal string
  if (magnitude >= 0) {
    // For numbers >= 1
    const decimalPlaces = n - magnitude - 1;
    return result.toFixed(Math.max(0, decimalPlaces));
  } else {
    // For numbers < 1
    const decimalPlaces = Math.abs(magnitude) + n - 1;
    return result.toFixed(decimalPlaces);
  }
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


