import { Address, formatUnits } from "viem";
import { calculatePTFixedYieldOnChain } from "./pendlePTRewards";
import { getUnclaimedRewards, getUserActiveBalance, getUserLPBalance } from "./userHelper";
import { UnclaimedReward } from "../types";
// Import any functions you need from pendleYTRewards as well


/**
 * Calculate the boost factor for a user's LP position
 * @param activeBalance User's active balance
 * @param lpBalance User's LP balance
 * @returns Boost factor as a number (1.0 means no boost)
 */
function calculateBoostFactor(activeBalance: bigint, lpBalance: bigint): number {
  if (lpBalance === 0n) return 1.0;
  return Number(activeBalance) / Number(lpBalance);
}

/**
 * Get comprehensive market rewards data for a user
 * @param marketAddress Pendle market address
 * @param userAddress User wallet address
 * @returns Detailed market rewards data
 */
async function getUserMarketRewards(
  marketAddress: Address,
  userAddress: Address
): Promise<{
  marketAddress: Address;
  lpBalance: bigint;
  activeBalance: bigint;
  boostFactor: number;
  unclaimedRewards: UnclaimedReward[];
}> {
  try {
    // Get balances
    const [lpBalance, activeBalance] = await Promise.all([
      getUserLPBalance(marketAddress, userAddress),
      getUserActiveBalance(marketAddress, userAddress)
    ]);
    
    // Calculate boost factor
    const boostFactor = calculateBoostFactor(activeBalance.activeBalanceRaw, lpBalance);
    
    // Get unclaimed rewards
    const unclaimedRewards = await getUnclaimedRewards(marketAddress, userAddress);

    return {
      marketAddress,
      lpBalance,
      activeBalance: activeBalance.activeBalanceRaw,
      boostFactor,
      unclaimedRewards
    };
  } catch (error) {
    console.error(`Error getting market rewards data for ${marketAddress}:`, error);
    throw error;
  }
}

/**
 * Get comprehensive rewards analysis for a user across all reward types
 * @param marketAddresses Array of Pendle market addresses
 * @param userAddress User wallet address 
 * @param routerAddress Pendle router address
 * @returns Comprehensive rewards analysis
 */
async function getAllUserRewards(
  marketAddresses: Address[],
  userAddress: Address,
  routerAddress: Address
) {
  // Store results
  const marketRewards: any[] = [];
  const ptRewards: any[] = [];
  const ytRewards: any[] = [];
  
  // Process each market
  for (const marketAddress of marketAddresses) {
    try {
      // Get market rewards (LP + unclaimed)
      const marketRewardData = await getUserMarketRewards(marketAddress, userAddress);
      marketRewards.push(marketRewardData);
      
      // const ptRewardData = await calculatePTFixedYieldOnChain(
      //   marketAddress, 
      //   userAddress, 
      //   routerAddress
      // );
      // ptRewards.push(ptRewardData);

      // // Get PT rewards if applicable
      // if (/* some condition to check if user has PT */) {
      //   const ptRewardData = await calculatePTFixedYieldOnChain(
      //     marketAddress, 
      //     userAddress, 
      //     routerAddress
      //   );
      //   ptRewards.push(ptRewardData);
      // }
      
      // Get YT rewards if applicable
      // Add your YT reward calculation logic here
      
    } catch (error) {
      console.error(`Error processing market ${marketAddress}:`, error);
    }
  }
  
  // Return all rewards in one object
  return {
    marketRewards,
    ptRewards,
    ytRewards,
    // Add summary statistics
    summary: {
      totalUnclaimedValue: 0, // Calculate from marketRewards
      totalPtProjectedValue: 0, // Calculate from ptRewards
      totalYtAccruedValue: 0, // Calculate from ytRewards
    }
  };
}

/**
 * Generate a formatted report for all user rewards
 * @param rewardsData Complete rewards data
 * @returns Formatted string report
 */
function formatUserRewardsReport(rewardsData: any): string {
  let report = `=== PENDLE REWARDS REPORT ===\n\n`;
  
  // Add market rewards section
  report += `--- MARKET LP REWARDS ---\n`;
  for (const market of rewardsData.marketRewards) {
    report += `Market: ${market.marketAddress}\n`;
    report += `LP Balance: ${formatUnits(market.lpBalance, 18)}\n`;
    report += `Boost Factor: ${market.boostFactor.toFixed(2)}x\n`;
    
    report += `Unclaimed Rewards:\n`;
    for (const reward of market.unclaimedRewards) {
      report += `  ${reward.token.symbol}: ${reward.amount}\n`;
    }
    report += `\n`;
  }
  
  // Add PT rewards section
  report += `--- PT FIXED YIELD ---\n`;
  for (const pt of rewardsData.ptRewards) {
    report += `PT: ${pt.ptSymbol} (${pt.ptAddress})\n`;
    report += `Balance: ${pt.ptTokens.toFixed(6)}\n`;
    report += `Maturity: ${pt.maturityDate} (${pt.daysToMaturity.toFixed(0)} days left)\n`;
    report += `Fixed APY: ${pt.fixedAPY.toFixed(2)}%\n`;
    report += `Current Value: $${pt.estimatedCurrentValue.toFixed(2)}\n`;
    report += `Maturity Value: $${pt.valueAtMaturity.toFixed(2)}\n`;
    report += `Projected Gain: ${pt.projectedGain.percentage.toFixed(2)}%\n\n`;
  }
  
  // Add YT rewards section
  // Customize based on your YT rewards structure
  
  // Add summary
  report += `=== SUMMARY ===\n`;
  report += `Total Unclaimed Rewards Value: $${rewardsData.summary.totalUnclaimedValue.toFixed(2)}\n`;
  report += `Total PT Projected Value: $${rewardsData.summary.totalPtProjectedValue.toFixed(2)}\n`;
  report += `Total YT Accrued Value: $${rewardsData.summary.totalYtAccruedValue.toFixed(2)}\n`;
  report += `Combined Total Value: $${(
    rewardsData.summary.totalUnclaimedValue + 
    rewardsData.summary.totalPtProjectedValue + 
    rewardsData.summary.totalYtAccruedValue
  ).toFixed(2)}\n`;
  
  return report;
}

/**
 * Example CLI interface 
 */
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const userAddress = args[0] as Address;
  const marketAddresses = args.slice(1) as Address[];
  
  if (!userAddress || marketAddresses.length === 0) {
    console.error('Missing required arguments');
    console.error('Usage: yarn run user:rewards <userAddress> <marketAddress1> [marketAddress2] ...');
    process.exit(1);
  }
  
  try {
    // Get all user rewards
    const routerAddress = "0x888888888889758F76e7103c6CbF23ABbF58F946" as Address; // Set your router address
    const rewardsData = await getAllUserRewards(marketAddresses, userAddress, routerAddress);
    
    // Print formatted report
    console.log(formatUserRewardsReport(rewardsData));
    
    return rewardsData;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (import.meta.url === import.meta.resolve('./userRewards.ts')) {
  main().catch(console.error);
}

export {
  getUserMarketRewards,
  getAllUserRewards,
  formatUserRewardsReport,
  calculateBoostFactor
};