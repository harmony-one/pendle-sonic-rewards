// getAllRewardInfo.ts - Combined script for all info
import { getAddress } from 'viem';
import * as fs from 'fs';
import { getMarketClaimedRewards } from './marketRewards';
import { getMarketRewardUpdates } from './rewardUpdates';
import { getCurrentRewardRate } from './currentRewardRate';
import { getTimestamp } from '../helper';


/**
 * Gets all reward information for a market
 */
async function getAllMarketRewardInfo(marketAddress: string, timeRange: string) {
  try {
    const sinceDate = getTimestamp(timeRange);

    console.log(`Fetching all reward information for market ${marketAddress} since ${timeRange}...`);

    const [claimedRewards, rewardUpdates, currentRate] = await Promise.all([
      getMarketClaimedRewards(marketAddress, sinceDate),
      getMarketRewardUpdates(marketAddress, sinceDate),
      getCurrentRewardRate(marketAddress)
    ]);
    
    const result = {
      marketAddress: getAddress(marketAddress),
      currentRewardRate: currentRate,
      rewardUpdates: rewardUpdates,
      claimedRewards: claimedRewards,
    };
    
    // Export each dataset to a separate file
    const baseFilename = `market_${marketAddress.substring(0, 8)}`;
    
    // Export current rate
    fs.writeFileSync(
      `${baseFilename}_current_rate.json`, 
      JSON.stringify(currentRate, null, 2)
    );
    
    // Export updates
    fs.writeFileSync(
      `${baseFilename}_updates_${timeRange}.json`, 
      JSON.stringify(rewardUpdates, null, 2)
    );
    
    // Export claimed rewards
    fs.writeFileSync(
      `${baseFilename}_claimed_${timeRange}.json`, 
      JSON.stringify(claimedRewards, null, 2)
    );
    
    console.log(`All data exported to files with prefix ${baseFilename}`);
    
    return result;
  } catch (error) {
    console.error("Error fetching all market reward info:", error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const marketAddress = args[0];
  const timeRange = args[1] || 'month';
  
  if (!marketAddress) {
    console.error('Please provide a market address');
    process.exit(1);
  }
  
  const rewardInfo = await getAllMarketRewardInfo(marketAddress, timeRange);
  
  // Display current reward rate
  console.log('\n=== Current Reward Rate ===');
  console.log(`PENDLE per second: ${rewardInfo.currentRewardRate.pendlePerSecFormatted}`);
  console.log(`Accumulated PENDLE: ${rewardInfo.currentRewardRate.accumulatedPendleFormatted}`);
  console.log(`Last updated: ${rewardInfo.currentRewardRate.lastUpdated.toLocaleString()}`);
  console.log(`Incentive ends at: ${rewardInfo.currentRewardRate.incentiveEndsAt.toLocaleString()}`);
  
  // Display reward updates history
  console.log('\n=== Reward Rate Update History ===');
  for (const update of rewardInfo.rewardUpdates.slice(0, 5)) { // Show only 5 most recent
    console.log(`[${update.timestamp.toLocaleString()}] PENDLE/sec: ${update.pendlePerSecFormatted} (until ${update.incentiveEndsAt.toLocaleString()})`);
  }
  if (rewardInfo.rewardUpdates.length > 5) {
    console.log(`...and ${rewardInfo.rewardUpdates.length - 5} more updates`);
  }
  
  // Display claimed rewards
  console.log('\n=== Claimed Rewards History ===');
  let totalClaimed = BigInt(0);
  for (const claim of rewardInfo.claimedRewards.slice(0, 5)) { // Show only 5 most recent
    console.log(`[${claim.timestamp.toLocaleString()}] Claimed: ${claim.amountFormatted} ${claim.token?.symbol}`);
    totalClaimed += BigInt(claim.amount);
  }
  if (rewardInfo.claimedRewards.length > 5) {
    console.log(`...and ${rewardInfo.claimedRewards.length - 5} more claims`);
  }
  
  // Show totals
  console.log('\n=== Summary ===');
  const pendleInfo = rewardInfo.currentRewardRate.pendleToken;
  if (pendleInfo) {
    const formatTokenAmount = (amount: string, decimals: number) => {
      return (BigInt(amount) / BigInt(10 ** decimals)).toString();
    };
    console.log(`Total PENDLE claimed: ${formatTokenAmount(totalClaimed.toString(), pendleInfo.decimals)} ${pendleInfo.symbol}`);
    console.log(`Current reward rate: ${rewardInfo.currentRewardRate.pendlePerSecFormatted} ${pendleInfo.symbol}/second`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { getAllMarketRewardInfo };