// pendleAPR.ts - Revised implementation
import { Address, formatUnits, parseUnits } from "viem";
import Decimal from 'decimal.js';
import moment from "moment";
import coinGeckoService from "../web3/api/coinGecko";
import { client } from "../web3/client";
import { calculateAPR, getMarketInfo, getTokenInfo, portfolioItemFactory, roundToSignificantDigits } from "../web3/helper";

// ABI for user reward inspection in RewardManager
const REWARD_MANAGER_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "", "type": "address"},
      {"internalType": "address", "name": "", "type": "address"}
    ],
    "name": "userReward",
    "outputs": [
      {"internalType": "uint128", "name": "index", "type": "uint128"},
      {"internalType": "uint128", "name": "accrued", "type": "uint128"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// ABI for PendleMarket
const PENDLE_MARKET_ABI = [
  // Basic ERC20 functions
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRewardTokens",
    "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "readTokens",
    "outputs": [
      {"internalType": "address", "name": "_SY", "type": "address"},
      {"internalType": "address", "name": "_PT", "type": "address"},
      {"internalType": "address", "name": "_YT", "type": "address"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * Get pending rewards directly from contract storage
 * This accesses the userReward mapping to get accrued rewards without calling redeemRewards
 */
// async function getPendingRewards(marketAddress: Address, userAddress: Address) {
//   try {
//     // Get reward tokens first
//     const rewardTokenAddresses = await client.readContract({
//       address: marketAddress,
//       abi: PENDLE_MARKET_ABI,
//       functionName: 'getRewardTokens',
//     }) as Address[];
    
//     const rewards: any[]= [];
//     let totalRewardsUSD = 0;
//     console.log('FCO::::::::: rewardTokenAddresses', rewardTokenAddresses)
//     for (const tokenAddress of rewardTokenAddresses) {
//       // Get token info
//       const tokenInfo = await getTokenInfo(tokenAddress);
//       if (!tokenInfo) continue;
      
//       // Access the userReward mapping directly - this is where accrued rewards are stored
//       const userReward = await client.readContract({
//         address: marketAddress,
//         abi: REWARD_MANAGER_ABI,
//         functionName: 'userReward',
//         args: [tokenAddress, userAddress]
//       }) as [bigint, bigint]; // [index, accrued]
      
//       const accrued = userReward[1]; // Second value is the accrued amount
      
//       // Get token price from CoinGecko
//       const tokenId = coinGeckoService.getCoinGeckoIdFromAddress(tokenAddress)
//       const tokenPrice = tokenId ? await coinGeckoService.getTokenPrice(tokenId) : 0;
//       // Calculate USD value
//       const amount = formatUnits(accrued, tokenInfo.decimals);
//       const valueUSD = new Decimal(amount).mul(tokenPrice).toNumber();
//       totalRewardsUSD += valueUSD;
      
//       rewards.push({
//         token: tokenAddress,
//         symbol: tokenInfo.symbol,
//         amount: accrued,
//         formattedAmount: amount,
//         decimals: tokenInfo.decimals,
//         price: tokenPrice,
//         valueUSD
//       });
//     }
    
//     return { rewards, totalRewardsUSD };
//   } catch (error) {
//     console.error("Error fetching pending rewards:", error);
//     return { rewards: [], totalRewardsUSD: 0 };
//   }
// }


async function getPendingRewards(marketAddress: Address, userAddress: Address) {
  try {
    // Get reward tokens
    const rewardTokenAddresses = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'getRewardTokens',
    }) as Address[];
    
    console.log('Reward token addresses:', rewardTokenAddresses);
    
    // For each reward token, verify its identity and check accrued rewards
    const rewards: any[] = [];
    let totalRewardsUSD = 0;
    
    for (const tokenAddress of rewardTokenAddresses) {
      // Verify token identity by reading its symbol directly
      let symbol, decimals;
      try {
        [symbol, decimals] = await Promise.all([
          client.readContract({
            address: tokenAddress,
            abi: [{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}],
            functionName: 'symbol',
          }),
          client.readContract({
            address: tokenAddress,
            abi: [{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"}],
            functionName: 'decimals',
          })
        ]);
        
        console.log(`Token ${tokenAddress} identity: ${symbol}, decimals: ${decimals}`);
      } catch (e) {
        console.error(`Failed to get token info for ${tokenAddress}:`, e);
        continue;
      }
      
      // Get token price
      let tokenPrice = 0;
      if (symbol === 'PENDLE') {
        tokenPrice = await coinGeckoService.getTokenPrice('pendle');
      } else if (symbol === 'SONIC') {
        tokenPrice = await coinGeckoService.getTokenPrice('sonic-token');
      } else {
        // For other tokens, try to find a match in the mapping
        const tokenId = coinGeckoService.getCoinGeckoIdFromAddress(tokenAddress);
        if (tokenId) {
          tokenPrice = await coinGeckoService.getTokenPrice(tokenId);
        }
      }
      
      // Try a simpler approach - check if the PendleGauge contract has a function to get pending rewards
      try {
        // Check if the contract has any function to get pending rewards directly
        console.log('Checking for direct pending rewards functions...');
        
        // Option 1: Check if there's a pendingRewards function
        try {
          const pendingReward = await client.readContract({
            address: marketAddress,
            abi: [{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"token","type":"address"}],"name":"pendingRewards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}],
            functionName: 'pendingRewards',
            args: [userAddress, tokenAddress]
          }) as bigint;
          
          console.log(`Found pendingRewards for ${symbol}: ${pendingReward.toString()}`);
          
          if (pendingReward > BigInt(0)) {
            const formattedAmount = formatUnits(pendingReward, decimals as number);
            const valueUSD = new Decimal(formattedAmount).mul(tokenPrice).toNumber();
            totalRewardsUSD += valueUSD;
            
            rewards.push({
              token: tokenAddress,
              symbol,
              amount: pendingReward,
              formattedAmount,
              decimals,
              price: tokenPrice,
              valueUSD
            });
          } else {
            rewards.push({
              token: tokenAddress,
              symbol,
              amount: BigInt(0),
              formattedAmount: '0',
              decimals,
              price: tokenPrice,
              valueUSD: 0
            });
          }
          continue; // Skip to next token if this worked
        } catch (e) {
          console.log('No pendingRewards function found');
        }
        
        // Option 2: Check for userReward mapping
        try {
          // Try with direct userReward mapping access
          const userReward = await client.readContract({
            address: marketAddress,
            abi: [{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"userReward","outputs":[{"internalType":"uint128","name":"index","type":"uint128"},{"internalType":"uint128","name":"accrued","type":"uint128"}],"stateMutability":"view","type":"function"}],
            functionName: 'userReward',
            args: [tokenAddress, userAddress]
          }) as [bigint, bigint];
          
          const accrued = userReward[1];
          console.log(`Found userReward for ${symbol}: ${accrued.toString()}`);
          
          if (accrued > BigInt(0)) {
            const formattedAmount = formatUnits(accrued, decimals as number);
            const valueUSD = new Decimal(formattedAmount).mul(tokenPrice).toNumber();
            totalRewardsUSD += valueUSD;
            
            rewards.push({
              token: tokenAddress,
              symbol,
              amount: accrued,
              formattedAmount,
              decimals,
              price: tokenPrice,
              valueUSD
            });
          } else {
            rewards.push({
              token: tokenAddress,
              symbol,
              amount: BigInt(0),
              formattedAmount: '0',
              decimals,
              price: tokenPrice,
              valueUSD: 0
            });
          }
          continue; // Skip to next token if this worked
        } catch (e) {
          console.log('No userReward mapping found in expected format');
        }
        
        // If all else fails, just add the token with zero rewards
        rewards.push({
          token: tokenAddress,
          symbol,
          amount: BigInt(0),
          formattedAmount: '0',
          decimals,
          price: tokenPrice,
          valueUSD: 0
        });
        
      } catch (error) {
        console.error(`Error processing rewards for token ${symbol}:`, error);
        // Still add the token to the list with zero value
        rewards.push({
          token: tokenAddress,
          symbol,
          amount: BigInt(0),
          formattedAmount: '0',
          decimals,
          price: tokenPrice,
          valueUSD: 0
        });
      }
    }
    
    return { rewards, totalRewardsUSD };
  } catch (error) {
    console.error("Error fetching pending rewards:", error);
    return { rewards: [], totalRewardsUSD: 0 };
  }
}


/**
 * Get current LP token balance
 */
async function getLPBalance(marketAddress: Address, userAddress: Address) {
  try {
    const balance = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    }) as bigint;
    return balance;
  } catch (error) {
    console.error("Error fetching LP balance:", error);
    return BigInt(0);
  }
}

/**
 * Get user's position in the market - checks both LP tokens and PT tokens
 */
export async function getUserPosition(marketAddress: Address, userAddress: Address) {
  try {
    // First check LP token balance (for liquidity providers)
    const lpBalance = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    }) as bigint;
    
    // If user has LP tokens, return that position
    if (lpBalance > BigInt(0)) {
      return { 
        type: 'LP', 
        balance: lpBalance 
      };
    }
    
    // If not, get the market tokens to check PT balance
    const tokens = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'readTokens',
    }) as [Address, Address, Address]; // [SY, PT, YT]
    
    const ptTokenAddress = tokens[1]; // PT token address
    
    // Check PT token balance
    const ptBalance = await client.readContract({
      address: ptTokenAddress,
      abi: [
        {
          "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }
      ],
      functionName: 'balanceOf',
      args: [userAddress]
    }) as bigint;
    
    return {
      type: 'PT',
      balance: ptBalance
    };
    
  } catch (error) {
    console.error("Error fetching user position:", error);
    return { type: 'NONE', balance: BigInt(0) };
  }
}


/**
 * Calculate APR for Pendle market
 * 
 * @param marketAddress The address of the Pendle market
 * @param userAddress The user's wallet address
 * @param depositAmount Manual input for deposit amount (required)
 * @param depositDate Manual input for deposit date (required)
 */
export async function calculatePendleAPR(
  marketAddress: Address, 
  userAddress: Address,
  depositAmount: string,
  depositDate: string
) {
  try {
    // Validate inputs
    if (!depositAmount || !depositDate) {
      throw new Error("Deposit amount and date are required");
    }
    
    // Parse deposit date
    const depositDateObj = new Date(depositDate);
    if (isNaN(depositDateObj.getTime())) {
      throw new Error("Invalid deposit date format");
    }
    
    // Parse deposit amount
    const depositValueUSD = Number(depositAmount);
    if (isNaN(depositValueUSD) || depositValueUSD <= 0) {
      throw new Error("Deposit amount must be a positive number");
    }
    
    // Get market info
    const marketInfo = await getMarketInfo(marketAddress);

    const position = await getUserPosition(marketAddress, userAddress);
    if (position.balance === BigInt(0)) {
      throw new Error("User has no LP tokens in this market");
    }
    
    // Get pending rewards
    const { rewards, totalRewardsUSD } = await getPendingRewards(marketAddress, userAddress);
    
    // Calculate days elapsed
    const currentDate = new Date();
    const daysElapsed = (currentDate.getTime() - depositDateObj.getTime()) / (1000 * 60 * 60 * 24);
    
    // Calculate APR
    const apr = calculateAPR(
      depositValueUSD,
      totalRewardsUSD,
      daysElapsed
    );
    
    // Create portfolio item
    const portfolioItem = portfolioItemFactory();
    
    // Fill in portfolio item details
    portfolioItem.name = marketInfo.principalToken?.symbol || 'Pendle Market';
    portfolioItem.address = marketAddress;
    portfolioItem.type = 'Pendle Market';
    portfolioItem.depositTime = moment(depositDateObj).format('YY/MM/DD HH:MM:SS');
    
    // Set deposit information
    portfolioItem.depositAsset0 = marketInfo.principalToken?.symbol || 'LP';
    portfolioItem.depositAmount0 = roundToSignificantDigits(depositAmount);
    portfolioItem.depositValue0 = roundToSignificantDigits(depositValueUSD.toString());
    portfolioItem.depositValue = roundToSignificantDigits(depositValueUSD.toString());
    
    // Set reward information
    if (rewards.length > 0) {
      portfolioItem.rewardAsset0 = rewards[0].symbol;
      portfolioItem.rewardAmount0 = roundToSignificantDigits(rewards[0].formattedAmount);
      portfolioItem.rewardValue0 = roundToSignificantDigits(rewards[0].valueUSD.toString());
      portfolioItem.rewardValue = roundToSignificantDigits(totalRewardsUSD.toString());
      
      // Add second reward if available
      if (rewards.length > 1) {
        portfolioItem.rewardAsset1 = rewards[1].symbol;
        portfolioItem.rewardAmount1 = roundToSignificantDigits(rewards[1].formattedAmount);
        portfolioItem.rewardValue1 = roundToSignificantDigits(rewards[1].valueUSD.toString());
      }
    }
    
    // Set time information
    portfolioItem.totalDays = roundToSignificantDigits(daysElapsed.toString(), 4);
    portfolioItem.apr = roundToSignificantDigits(apr.toString());
    
    // Set deposit link
    portfolioItem.depositLink = `https://app.pendle.finance/trade/markets/${marketAddress}/swap?view=pt&chain=sonic`;
    
    return portfolioItem;
  } catch (error) {
    console.error("Error calculating Pendle APR:", error);
    throw error;
  }
}

// Main function
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const marketAddress = args[0] as Address;
  const userAddress = args[1] as Address;
  const depositAmount = args[2];
  const depositDate = args[3];
  
  if (!marketAddress || !userAddress || !depositAmount || !depositDate) {
    console.error('Missing required arguments');
    console.error('Usage: node pendleAPR.js <marketAddress> <userAddress> <depositAmount> <depositDate>');
    console.error('Example: node pendleAPR.js 0x6e4e95fab7db1f0524b4b0a05f0b9c96380b7dfa 0x123... 10 "2023-04-01"');
    process.exit(1);
  }
  
  console.log(`Calculating APR for market ${marketAddress} and user ${userAddress}...`);
  
  try {
    // Calculate APR
    const result = await calculatePendleAPR(
      marketAddress,
      userAddress,
      depositAmount,
      depositDate
    );
    
    console.log("\n==== PENDLE MARKET APR CALCULATION ====");
    console.log(`Market: ${result.name} (${result.address})`);
    console.log(`Deposit: ${result.depositAmount0} ${result.depositAsset0} ($${result.depositValue0})`);
    console.log(`Days elapsed: ${result.totalDays}`);
    console.log(`Pending rewards: ${result.rewardAmount0} ${result.rewardAsset0} ($${result.rewardValue0})`);
    
    if (result.rewardAsset1) {
      console.log(`Additional rewards: ${result.rewardAmount1} ${result.rewardAsset1} ($${result.rewardValue1})`);
    }
    
    console.log(`Total reward value: $${result.rewardValue}`);
    console.log(`Calculated APR: ${result.apr}%`);
    console.log("=====================================");
    
    return result;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (import.meta.url === import.meta.resolve('./positionAPR.ts')) {
  main().catch(console.error);
}
