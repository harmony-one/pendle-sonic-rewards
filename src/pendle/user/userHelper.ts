import { Address, formatUnits } from "viem";
import PENDLE_MARKET_ABI from '../web3/abis/PendleMarket.json';
import REWARD_MANAGER_ABI from '../web3/abis/RewardManager.json'
import { UnclaimedReward } from "../types";
import { getMarketRewardTokens } from "../market/marketHelper";
import coinGeckoService from "../../common/api/coinGecko";
import { client } from "../../common/web3/client";
import { getTokenInfo } from "../../common/web3/helper";

/**
 * Get reward data from userReward mapping for a specific token
 * @param marketAddress Pendle market address
 * @param tokenAddress Reward token address
 * @param userAddress User wallet address
 * @returns Reward data with index and accrued amount
 */
export async function getUserRewardData(
  marketAddress: Address,
  tokenAddress: Address,
  userAddress: Address
): Promise<{ index: bigint, accrued: bigint }> {
  try {
    const rewardData = await client.readContract({
      address: marketAddress,
      abi: REWARD_MANAGER_ABI,
      functionName: 'userReward',
      args: [tokenAddress, userAddress]
    }) as { index: bigint, accrued: bigint };

    return { 
      index: rewardData[0], 
      accrued: rewardData[1]
    };

  } catch (error) {
    console.error(`Error getting user reward data for token ${tokenAddress}:`, error);
    return { index: 0n, accrued: 0n };
  }
}

/**
 * Get a user's active balance in a market with additional context
 * @param marketAddress Pendle market address
 * @param userAddress User wallet address
 * @returns Active balance details
 */
export async function getUserActiveBalance(
  marketAddress: Address,
  userAddress: Address
): Promise<{
  activeBalanceRaw: bigint;
  activeBalanceFormatted: string;
  lpBalanceRaw: bigint;
  lpBalanceFormatted: string;
  boostFactor: number;
  maxBoostFactor: number;
  isMaxBoosted: boolean;
  totalActiveSupply: bigint;
  percentOfActiveSupply: string;
}> {
  try {
    // Get active balance, LP balance and total active supply in parallel
    const [activeBalance, lpBalance, totalActiveSupply] = await Promise.all([
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'activeBalance',
        args: [userAddress]
      }) as unknown as bigint,
      
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'balanceOf',
        args: [userAddress]
      }) as unknown as bigint,
      
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'totalActiveSupply'
      }) as unknown as bigint
    ]);
    
    // Format values for readability
    const activeBalanceFormatted = formatUnits(activeBalance, 18);
    const lpBalanceFormatted = formatUnits(lpBalance, 18);
    
    // Calculate boost factor
    const boostFactor = lpBalance > 0n 
      ? Number(activeBalance) / Number(lpBalance) 
      : 0;
    
    // In Pendle, the maximum boost is typically 2.5x
    const maxBoostFactor = 2.5; 
    
    // Calculate percentage of total active supply
    const percentOfActiveSupply = totalActiveSupply > 0n
      ? ((Number(activeBalance) / Number(totalActiveSupply)) * 100).toFixed(4) + '%'
      : '0%';
    
    return {
      activeBalanceRaw: activeBalance,
      activeBalanceFormatted,
      lpBalanceRaw: lpBalance,
      lpBalanceFormatted,
      boostFactor,
      maxBoostFactor,
      isMaxBoosted: boostFactor >= maxBoostFactor,
      totalActiveSupply,
      percentOfActiveSupply
    };
  } catch (error) {
    console.error(`Error getting user active balance for market ${marketAddress}:`, error);
    return {
      activeBalanceRaw: 0n,
      activeBalanceFormatted: '0',
      lpBalanceRaw: 0n,
      lpBalanceFormatted: '0',
      boostFactor: 0,
      maxBoostFactor: 2.5,
      isMaxBoosted: false,
      totalActiveSupply: 0n,
      percentOfActiveSupply: '0%'
    };
  }
}

/**
 * Get a user's normal LP balance in a market
 * @param marketAddress Pendle market address
 * @param userAddress User wallet address 
 * @returns LP balance as a bigint
 */
export async function getUserLPBalance(
  marketAddress: Address,
  userAddress: Address
): Promise<bigint> {
  try {
    const balance = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    }) as bigint;
    
    return balance;
  } catch (error) {
    console.error(`Error getting user LP balance for market ${marketAddress}:`, error);
    return 0n;
  }
}

/**
 * Get all unclaimed rewards for a user in a specific market
 * @param marketAddress Pendle market address
 * @param userAddress User wallet address
 * @returns Array of unclaimed rewards with token details
 */
export async function getUnclaimedRewards(
  marketAddress: Address, 
  userAddress: Address
): Promise<UnclaimedReward[]> {
  try {
    console.log(`Getting unclaimed rewards for user ${userAddress} in market ${marketAddress}...`);
    
    // Step 1: Get reward token addresses from the market
    const rewardTokenAddresses = await getMarketRewardTokens(marketAddress);
    
    console.log(`Found ${rewardTokenAddresses.length} reward tokens for market ${marketAddress}`);
    
    if (rewardTokenAddresses.length === 0) {
      return [];
    }
    
    // Step 2: For each reward token, get the unclaimed amount
    const unclaimedRewards: UnclaimedReward[] = [];
    
    for (const tokenAddress of rewardTokenAddresses) {
      try {
        // Read the userReward mapping for this token and user
        const userRewardData = await getUserRewardData(marketAddress, tokenAddress, userAddress);
        
        // Get token details
        const tokenInfo = await getTokenInfo(tokenAddress);
        
        if (!tokenInfo) {
          console.warn(`Could not get token info for ${tokenAddress}`);
          continue;
        }

        // Format the accrued amount
        const formattedAmount = formatUnits(userRewardData.accrued, tokenInfo.decimals);
        
        // Add to the results if there's a non-zero amount
        if (userRewardData.accrued > 0n) {
          unclaimedRewards.push({
            token: {
              address: tokenAddress,
              symbol: tokenInfo.symbol,
              decimals: tokenInfo.decimals
            },
            amount: formattedAmount,
            amountRaw: userRewardData.accrued
          });
          
          console.log(`Unclaimed ${tokenInfo.symbol}: ${formattedAmount}`);
        }
      } catch (error) {
        console.error(`Error getting unclaimed rewards for token ${tokenAddress}:`, error);
      }
    }
    
    return unclaimedRewards;
  } catch (error) {
    console.error(`Error getting unclaimed rewards for market ${marketAddress}:`, error);
    return [];
  }
}

export async function getLPClaimableRewards(
  marketAddress: Address,
  userAddress: Address,
): Promise<{
  rewards: UnclaimedReward[];
  totalUsdValue: number;
  formattedTotalUsd: string;
}> {
  try {
    console.log(`Getting LP claimable rewards for user ${userAddress} in market ${marketAddress}...`);
    
    // Get reward tokens for this market
    const rewardTokens = await getMarketRewardTokens(marketAddress);
    console.log(`Found ${rewardTokens.length} reward tokens for market ${marketAddress}`);
    
    // Simulate a call to redeemRewards
    const simulatedRewardAmounts = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'redeemRewards',
      args: [userAddress]
    }) as bigint[];
    
    console.log(`Simulated reward amounts:`, simulatedRewardAmounts.map(n => n.toString()));
    
    // Build the unclaimed rewards data
    const unclaimedRewards: UnclaimedReward[] = [];
    let totalUsdValue = 0;
    
    // Map reward tokens to the simulated amounts
    for (let i = 0; i < Math.min(rewardTokens.length, simulatedRewardAmounts.length); i++) {
      const tokenAddress = rewardTokens[i];
      const amount = simulatedRewardAmounts[i];
      

      if (amount > 0n) {
        const tokenInfo = await getTokenInfo(tokenAddress);
        
        if (!tokenInfo) {
          console.warn(`Could not get token info for ${tokenAddress}`);
          continue;
        }
        
        const formattedAmount = formatUnits(amount, tokenInfo.decimals);
        
        // Calculate USD value if prices are provided
        let usdValue = 0;
        const tokenId = coinGeckoService.getCoinGeckoIdFromAddress(tokenAddress.toLowerCase())
        if (tokenId) {
          const tokenPrice = await coinGeckoService.getTokenPrice(tokenId)
          usdValue = parseFloat(formattedAmount) * tokenPrice
          totalUsdValue += usdValue;
        }        
        unclaimedRewards.push({
          token: {
            address: tokenAddress,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals
          },
          amount: formattedAmount,
          amountRaw: amount,
          usdValue
        });
        
        console.log(`Claimable ${tokenInfo.symbol}: ${formattedAmount} (${usdValue ? `$${usdValue.toFixed(4)}` : 'N/A'})`);
      }
    }
    
    // Format total USD value similar to Pendle UI
    // For small values (<$0.01), the UI shows "<$0.01"
    let formattedTotalUsd = '$0.00';
    if (totalUsdValue > 0) {
      if (totalUsdValue < 0.01) {
        formattedTotalUsd = "<$0.01";
      } else {
        formattedTotalUsd = `$${totalUsdValue.toFixed(2)}`;
      }
    }
    
    return {
      rewards: unclaimedRewards,
      totalUsdValue,
      formattedTotalUsd
    };
  } catch (error) {
    console.error(`Error getting LP claimable rewards for market ${marketAddress}:`, error);
    return {
      rewards: [],
      totalUsdValue: 0,
      formattedTotalUsd: '$0.00'
    };
  }
}