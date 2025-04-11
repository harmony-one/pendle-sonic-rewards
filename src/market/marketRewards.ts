// marketRewards.ts - For getting claimed rewards
import { Address, getAddress } from 'viem';
import config from '../config';
import { MarketRewardInfo } from '../types';
import { getGaugeController, getMarketInfo, getTokenInfo } from '../web3/helper';
import { formatTokenAmount } from '../web3/numberUtils';
import * as fs from 'fs';
import * as path from 'path';
import { ensureExportDirectory, formatMarketHeader, getTimestamp } from '../helper';

const SUBGRAPH_URL = config.graphUrl;
const MAX_ITEMS_PER_PAGE = 1000;

/**
 * Fetches all rewards claimed by a market with pagination
 */
async function fetchMarketRewardsPage(
  marketAddress: string, 
  sinceDate: number, 
  skip: number = 0
): Promise<any[]> {
  const normalizedAddress = marketAddress.toLowerCase();
  
  const query = `
    query GetMarketRewards($marketAddress: Bytes!, $sinceDate: BigInt!, $skip: Int!) {
      marketRewards(
        first: ${MAX_ITEMS_PER_PAGE}
        skip: $skip
        where: { market: $marketAddress, timestamp_gte: $sinceDate }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        market
        amount
        timestamp
        blockNumber
      }
    }
  `;

  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: {
        marketAddress: normalizedAddress,
        sinceDate: `${sinceDate}`,
        skip: skip
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const result = await response.json();
  
  // Add error handling for GraphQL errors
  if (result.errors) {
    console.error("GraphQL errors:", result.errors);
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }
  
  return result.data?.marketRewards || [];
}

/**
 * Fetches all rewards claimed by a market
 */
async function getMarketClaimedRewards(marketAddress: string, sinceDate: number): Promise<MarketRewardInfo[]> {
  try {
    // Implement pagination to handle more than 1000 rows
    let allRewards: any[] = [];
    let currentPage = 0;
    let hasMoreData = true;
    
    while (hasMoreData) {
      const skip = currentPage * MAX_ITEMS_PER_PAGE;
      const rewards = await fetchMarketRewardsPage(marketAddress, sinceDate, skip);
      
      allRewards = [...allRewards, ...rewards];
      currentPage++;
      
      // If we received fewer items than the maximum, we've reached the end
      if (rewards.length < MAX_ITEMS_PER_PAGE) {
        hasMoreData = false;
      }
      
      // Log progress for larger datasets
      console.log(`Fetched ${allRewards.length} rewards so far...`);
    }
    
    // Get market info
    const marketInfo = await getMarketInfo(
      getAddress(marketAddress)
    );
    
    // Get PENDLE token info
    const gaugeController = await getGaugeController();
    const pendleTokenAddress = await gaugeController.read.pendle();
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress as Address);
    
    // Enrich the data
    return allRewards.map((reward: any) => ({
      id: reward.id,
      market: getAddress(reward.market),
      marketInfo,
      amount: reward.amount,
      amountFormatted: pendleTokenInfo && formatTokenAmount(reward.amount, pendleTokenInfo.decimals),
      timestamp: new Date(parseInt(reward.timestamp) * 1000),
      blockNumber: reward.blockNumber,
      token: pendleTokenInfo
    }));
  } catch (error) {
    console.error("Error fetching market rewards:", error);
    throw error;
  }
}

/**
 * Get the current reward rate from the GaugeController
 */
async function getCurrentRewardRate(marketAddress: string) {
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
 * Export data to TSV file
 */
async function exportToTsv(data: MarketRewardInfo[], marketAddress: string, timeRange: string) {
  const exportDir = ensureExportDirectory();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = path.join(exportDir, `${timestamp}_market_rewards_${marketAddress.substring(0, 8)}_${timeRange}.tsv`);
  
  // Generate market header
  const header = await formatMarketHeader(marketAddress);
  
  // Create TSV content
  const tableHeaders = ['Timestamp', 'Date', 'Market', 'Amount', 'Token', 'Block Number'];
  
  const rows = data.map(reward => [
    reward.timestamp.toISOString(),
    reward.timestamp.toLocaleString(),
    reward.market,
    reward.amountFormatted,
    reward.token?.symbol || 'UNKNOWN',
    reward.blockNumber
  ]);
  
  const tsvContent = [
    header,
    tableHeaders.join('\t'),
    ...rows.map(row => row.join('\t'))
  ].join('\n');
  
  fs.writeFileSync(filename, tsvContent);
  console.log(`Data exported to ${filename}`);
  return filename;
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
  
  console.log(`Fetching claimed rewards for market ${marketAddress} since ${timeRange}...`);
  
  // Get market header info for console display
  const headerInfo = await formatMarketHeader(marketAddress);
  console.log(headerInfo);
  
  const sinceDate = getTimestamp(timeRange);
  const rewards = await getMarketClaimedRewards(marketAddress, sinceDate);
  
  console.log(`\nFound ${rewards.length} claimed rewards`);
  
  // Display summary
  let totalClaimed = BigInt(0);
  for (const reward of rewards) {
    totalClaimed += BigInt(reward.amount);
  }
  
  if (rewards.length > 0 && rewards[0].token) {
    console.log(`Total claimed: ${formatTokenAmount(totalClaimed.toString(), rewards[0].token.decimals)} ${rewards[0].token.symbol}`);
  }
  
  // Export to TSV
  const exportedFile = await exportToTsv(rewards, marketAddress, timeRange);
  console.log(`\nReport saved to: ${exportedFile}`);
}

if (import.meta.url === import.meta.resolve('./marketRewards.ts')) {
  main().catch(console.error);
}

export { getMarketClaimedRewards };

