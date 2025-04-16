// pendleYTRewards.ts - Calculate and export Pendle YT rewards

import { Address, formatUnits } from "viem";
import ERC20_ABI from '../web3/abis/erc20.json';
import PENDLE_MARKET_ABI from '../web3/abis/PendleMarket.json';
import YIELD_TOKEN_ABI from '../web3/abis/YieldToken.json';
import moment from "moment";
import { client } from "../web3/client";
import config from "../config";
import fs from 'fs';
import path from 'path';
import { getMarketInfo } from "../market/marketHelper";


/**
 * Calculate YT yield rewards based on on-chain data
 * @param marketAddress Pendle market address
 * @param userAddress User's wallet address
 * @param routerAddress Pendle router address
 * @param startDate Optional start date for calculating rewards
 */
async function calculateYTYieldRewards(
  marketAddress: Address,
  userAddress: Address,
  routerAddress: Address,
  startDate?: Date
) {
  try {
    console.log("Getting on-chain data for YT yield calculation...");
    
    // Step 1: Get market tokens and expiry from contract
    const [tokens, expiry] = await Promise.all([
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'readTokens',
      }),
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'expiry',
      })
    ]);
    
    const [syAddress, ptAddress, ytAddress] = tokens as [Address, Address, Address];
    console.log("Market tokens:", { syAddress, ptAddress, ytAddress });
    
    const expiryDate = new Date(Number(expiry) * 1000);
    console.log("Market expiry date:", expiryDate);
    
    // Step 2: Get YT token info and balance
    const [ytDecimals, ytSymbol, ytBalance] = await Promise.all([
      client.readContract({
        address: ytAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      client.readContract({
        address: ytAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      client.readContract({
        address: ytAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress]
      })
    ]);
    
    // Step 3: Get SY token info to understand the underlying yield
    const [syDecimals, sySymbol] = await Promise.all([
      client.readContract({
        address: syAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      client.readContract({
        address: syAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      })
    ]);
    
    // Step 4: Calculate time parameters
    const currentTime = Math.floor(Date.now() / 1000);
    const secondsToMaturity = Math.max(0, Number(expiry) - currentTime);
    const daysToMaturity = secondsToMaturity / (60 * 60 * 24);
    
    // Get user's YT token balance
    const currentYtTokens = Number(formatUnits(ytBalance as bigint, Number(ytDecimals)));
    console.log(`User holds ${currentYtTokens} ${ytSymbol}`);
    
    if (currentYtTokens <= 0) {
      console.log("No YT tokens held by this address");
      return null;
    }
    
    // Get rewards already claimed by the user
    const claimedEvents = await getClaimedYieldEvents(ytAddress, userAddress, startDate);
    const totalClaimedRewards = claimedEvents.reduce((sum, event) => sum + event.amount, 0);
    
    // Get underlying SY reward rate to estimate future rewards
    const rewardRate = await getYTRewardRate(syAddress);
    
    // Get SY reward tokens
    const rewardTokens = await getRewardTokensFromSY(syAddress);
    
    // Estimate unclaimed rewards
    const unclaimedRewards = await estimateUnclaimedYTRewards(ytAddress, userAddress);
    
    // Calculate APY based on reward rate
    const estimatedAPY = calculateYTAPY(rewardRate, ytBalance as bigint);
    
    return {
      marketAddress,
      ytAddress,
      syAddress,
      ytSymbol,
      sySymbol,
      ytBalance: currentYtTokens,
      maturityDate: moment(expiryDate).format('YYYY-MM-DD'),
      daysToMaturity,
      rewards: {
        claimed: {
          total: totalClaimedRewards,
          events: claimedEvents
        },
        unclaimed: unclaimedRewards,
        rewardTokens
      },
      estimatedAPY,
      isExpired: currentTime > Number(expiry)
    };
  } catch (error) {
    console.error("Error calculating YT yield rewards:", error);
    throw error;
  }
}

/**
 * Get all YieldClaimed events for a specific user and YT token
 */
async function getClaimedYieldEvents(
  ytAddress: Address,
  userAddress: Address,
  startDate?: Date
) {
  try {
    // In a production app, you'd query from a subgraph or index events
    // For this example, we'll use a simplified approach
    
    // This would typically be a logs query to get YieldClaimed events
    // We're simplifying by returning a mock result
    
    // In reality, you'd use something like:
    /*
    const events = await client.getLogs({
      address: ytAddress,
      event: {
        type: 'event',
        name: 'YieldClaimed',
        inputs: [
          { type: 'address', name: 'user', indexed: true },
          { type: 'uint256', name: 'amount' }
        ]
      },
      args: {
        user: userAddress
      },
      fromBlock: startDate ? 
        BigInt(Math.floor(startDate.getTime() / 1000)) : 
        BigInt(0)
    });
    */
    
    // For demonstration, we'll simulate some claimed rewards
    console.log("Getting claimed yield events (note: using simulated data)");
    
    // In a real implementation, you would process actual event data
    const mockEvents: any[] = [];
    
    // Add simulated past events (in a real app, these would come from blockchain logs)
    if (Math.random() > 0.5) { // Randomly include some past events
      const pastDate1 = new Date();
      pastDate1.setDate(pastDate1.getDate() - 14);
      
      const pastDate2 = new Date();
      pastDate2.setDate(pastDate2.getDate() - 7);
      
      mockEvents.push({
        transactionHash: '0x' + '1'.repeat(64),
        blockNumber: 123456,
        timestamp: Math.floor(pastDate1.getTime() / 1000),
        amount: 0.0125
      });
      
      mockEvents.push({
        transactionHash: '0x' + '2'.repeat(64),
        blockNumber: 234567,
        timestamp: Math.floor(pastDate2.getTime() / 1000),
        amount: 0.0183
      });
    }
    
    return mockEvents;
  } catch (error) {
    console.error("Error getting YieldClaimed events:", error);
    return [];
  }
}

/**
 * Estimate unclaimed YT rewards
 */
async function estimateUnclaimedYTRewards(
  ytAddress: Address,
  userAddress: Address
) {
  try {
    // In a real implementation, you'd call a contract method or use events
    // to determine unclaimed rewards
    
    // Simplified approach for demonstration
    console.log("Estimating unclaimed YT rewards (note: using simulated data)");
    
    // For demonstration, we'll return a simulated unclaimed amount
    // In a real implementation, you might call something like:
    /*
    const unclaimedAmount = await client.readContract({
      address: ytAddress,
      abi: YIELD_TOKEN_ABI,
      functionName: 'getUnclaimedYield',
      args: [userAddress]
    });
    */
    
    // Simulate unclaimed rewards - in reality, this would come from the contract
    const simulatedUnclaimedAmount = 0.0079;
    
    return simulatedUnclaimedAmount;
  } catch (error) {
    console.error("Error estimating unclaimed YT rewards:", error);
    return 0;
  }
}

/**
 * Get reward tokens for a Standardized Yield token
 */
async function getRewardTokensFromSY(
  syAddress: Address
) {
  try {
    // In a real implementation, you'd call the SY contract to get reward tokens
    console.log("Getting reward tokens from SY (note: using simulated data)");
    
    /*
    const rewardTokens = await client.readContract({
      address: syAddress,
      abi: STANDARDIZED_YIELD_ABI,
      functionName: 'getRewardTokens',
    });
    */
    
    // For demonstration, return simulated reward tokens
    // In real implementation, these would be from the contract call
    return [
      { 
        address: "0xf1eF7d2D4C0c881cd634481e0586ed5d2871A74B", 
        symbol: "PENDLE",
        decimals: 18 
      },
      { 
        address: "0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38", 
        symbol: "WONE",
        decimals: 18 
      }
    ];
  } catch (error) {
    console.error("Error getting reward tokens from SY:", error);
    return [];
  }
}

/**
 * Get YT reward rate from SY
 */
async function getYTRewardRate(
  syAddress: Address
) {
  try {
    // In a real implementation, you'd analyze SY reward rates
    console.log("Getting YT reward rate (note: using simulated data)");
    
    // Simplified for demonstration
    // This would typically be derived from on-chain data about the SY
    const estimatedRewardRate = 0.08; // 8% annually
    
    return estimatedRewardRate;
  } catch (error) {
    console.error("Error calculating YT reward rate:", error);
    return 0;
  }
}

/**
 * Calculate YT APY based on reward rate
 */
function calculateYTAPY(
  rewardRate: number,
  ytBalance: bigint
) {
  try {
    // In a real implementation, this would be a more detailed calculation
    // based on current market conditions
    
    // Simplified calculation for demonstration
    return rewardRate * 100; // Convert to percentage
  } catch (error) {
    console.error("Error calculating YT APY:", error);
    return 0;
  }
}

/**
 * Format YT rewards report
 */
async function formatYTMarketHeader(marketAddress: string, result: any) {
  try {
    const marketInfo = await getMarketInfo(marketAddress as Address);
    
    // Build header
    const headerLines = [
      `# Pendle YT Rewards Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# Market: ${marketAddress} (${result.ytSymbol})`,
      `# `,
      `# Principal Token: ${marketInfo.principalToken?.symbol || 'N/A'} (${marketInfo.principalToken?.address || 'N/A'})`,
      `# Standardized Yield: ${marketInfo.standardizedYield?.symbol || 'N/A'} (${marketInfo.standardizedYield?.address || 'N/A'})`,
      `# Yield Token: ${marketInfo.yieldToken?.symbol || 'N/A'} (${marketInfo.yieldToken?.address || 'N/A'})`,
      `# `,
      `# Estimated APY: ${result.estimatedAPY.toFixed(2)}%`,
      `# Maturity Date: ${result.maturityDate} (${result.daysToMaturity.toFixed(2)} days remaining)`,
      `# `,
      `# User holds ${result.ytBalance.toFixed(6)} ${result.ytSymbol}`,
      `# Total claimed rewards: ${result.rewards.claimed.total.toFixed(6)}`,
      `# Unclaimed rewards: ${result.rewards.unclaimed.toFixed(6)}`,
      `# `
    ];
    
    return headerLines.join('\n');
  } catch (error) {
    console.error("Error creating market header:", error);
    return `# Pendle YT Rewards Report\n# Generated: ${new Date().toISOString()}\n# Market: ${marketAddress}\n# Error retrieving market details`;
  }
}

/**
 * Ensure export directory exists
 */
function ensureExportDirectory() {
  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  return exportDir;
}

/**
 * Export YT rewards data to TSV file
 */
async function exportYTRewardsToTsv(result: any, userAddress: string) {
  const exportDir = ensureExportDirectory();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = path.join(exportDir, `${timestamp}_yt_rewards_${result.marketAddress.substring(0, 8)}.tsv`);
  
  // Generate market header
  const header = await formatYTMarketHeader(result.marketAddress, result);
  
  // Create TSV data
  const headerRow = [
    'Market Address',
    'YT Symbol',
    'Maturity Date',
    'Days To Maturity',
    'YT Balance',
    'Estimated APY (%)',
    'Total Claimed',
    'Unclaimed',
    'Is Expired'
  ].join('\t');
  
  const dataRow = [
    result.marketAddress,
    result.ytSymbol,
    result.maturityDate,
    result.daysToMaturity.toFixed(2),
    result.ytBalance.toFixed(6),
    result.estimatedAPY.toFixed(2),
    result.rewards.claimed.total.toFixed(6),
    result.rewards.unclaimed.toFixed(6),
    result.isExpired ? 'Yes' : 'No'
  ].join('\t');
  
  // Add claimed rewards events if any
  let claimedRows = '';
  if (result.rewards.claimed.events.length > 0) {
    claimedRows = '\n\n# Claimed Rewards\nTimestamp\tBlock\tTransaction\tAmount\n';
    
    result.rewards.claimed.events.forEach((event: any) => {
      const date = new Date(event.timestamp * 1000);
      claimedRows += `${date.toISOString()}\t${event.blockNumber}\t${event.transactionHash}\t${event.amount.toFixed(6)}\n`;
    });
  }
  
  // Combine all content
  const tsvContent = [
    header,
    headerRow,
    dataRow,
    claimedRows
  ].join('\n');
  
  fs.writeFileSync(filename, tsvContent);
  console.log(`Data exported to ${filename}`);
  return filename;
}

/**
 * Generate formatted console report
 */
function generateConsoleReport(result: any) {
  console.log("\n==== PENDLE YT REWARDS ANALYSIS ====");
  console.log(`Market: ${result.ytSymbol} (${result.marketAddress})`);
  console.log(`Maturity Date: ${result.maturityDate} (${result.daysToMaturity.toFixed(2)} days remaining)`);
  
  console.log("\n--- User Position ---");
  console.log(`YT Token Balance: ${result.ytBalance.toFixed(6)} ${result.ytSymbol}`);
  
  console.log("\n--- Reward Analysis ---");
  console.log(`Estimated APY: ${result.estimatedAPY.toFixed(2)}%`);
  console.log(`Total Claimed Rewards: ${result.rewards.claimed.total.toFixed(6)}`);
  console.log(`Unclaimed Rewards: ${result.rewards.unclaimed.toFixed(6)}`);
  
  if (result.rewards.claimed.events.length > 0) {
    console.log("\n--- Claimed Rewards History ---");
    result.rewards.claimed.events.forEach((event: any) => {
      const date = new Date(event.timestamp * 1000);
      console.log(`${date.toISOString()}: ${event.amount.toFixed(6)} (Tx: ${event.transactionHash.substring(0, 10)}...)`);
    });
  }
  
  console.log("\n--- Reward Tokens ---");
  result.rewards.rewardTokens.forEach((token: any) => {
    console.log(`${token.symbol}: ${token.address}`);
  });
  
  console.log("\n--- Recommendations ---");
  if (result.rewards.unclaimed > 0) {
    console.log(`- You have ${result.rewards.unclaimed.toFixed(6)} unclaimed rewards available for claiming`);
  }
  if (result.isExpired) {
    console.log("- Your YT tokens have expired. You should claim any remaining rewards");
  } else {
    console.log(`- Continue holding your YT tokens to accrue yield until maturity (${result.daysToMaturity.toFixed(0)} days remaining)`);
  }
  
  console.log("=====================================");
  
  return {
    summary: `YT-${result.sySymbol.substring(0, 6)} current yield: ${result.estimatedAPY.toFixed(2)}% APY, unclaimed rewards: ${result.rewards.unclaimed.toFixed(6)}`,
    recommendation: result.rewards.unclaimed > 0 ? "Unclaimed rewards are available for claiming." : "No significant unclaimed rewards at this time."
  };
}

/**
 * Main function
 */
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const marketAddress = args[0] as Address;
  const userAddress = args[1] as Address;
  const startDateStr = args[2];
  
  if (!marketAddress || !userAddress) {
    console.error('Missing required arguments');
    console.error('Usage: yarn run user:yt:rewards <marketAddress> <userAddress> [startDate]');
    console.error('Example: yarn run user:yt:rewards 0x6e4e95fab7db1f0524b4b0a05f0b9c96380b7dfa 0x123... "2025-04-01"');
    process.exit(1);
  }
  
  console.log(`Calculating YT rewards for market ${marketAddress} and user ${userAddress}...`);
  
  try {
    // Parse start date if provided
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    
    // Perform the calculation
    const routerAddress = config.contracts.pendleRouter as Address;
    const result = await calculateYTYieldRewards(
      marketAddress,
      userAddress,
      routerAddress,
      startDate
    );
    
    if (!result) {
      console.log("No YT tokens found for this user address.");
      process.exit(0);
    }
    
    // Generate console report
    generateConsoleReport(result);
    
    // Export to TSV
    const exportedFile = await exportYTRewardsToTsv(result, userAddress);
    console.log(`\nReport saved to: ${exportedFile}`);
    
    return result;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (import.meta.url === import.meta.resolve('./pendleYTRewards.ts')) {
  main().catch(console.error);
}

export { calculateYTYieldRewards, generateConsoleReport };