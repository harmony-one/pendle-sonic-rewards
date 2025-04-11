// rewardUpdates.ts - For getting reward rate updates
import { Address, getAddress } from 'viem';
import config from '../config';
import { RewardUpdateInfo } from '../types';
import { getGaugeController, getMarketInfo, getTokenInfo } from '../web3/helper';
import { formatTokenAmount } from '../web3/numberUtils';
import * as fs from 'fs';
import * as path from 'path';
import { ensureExportDirectory, formatMarketHeader, getTimestamp } from '../helper';

const SUBGRAPH_URL = config.graphUrl;
const MAX_ITEMS_PER_PAGE = 1000;

/**
 * Fetches reward updates page by page
 */
async function fetchRewardUpdatesPage(
  marketAddress: string, 
  sinceDate: number, 
  skip: number = 0
): Promise<any[]> {
  const normalizedAddress = marketAddress.toLowerCase();
  
  const query = `
    query GetRewardUpdates($marketAddress: Bytes!, $sinceDate: BigInt!, $skip: Int!) {
      rewardUpdates(
        first: ${MAX_ITEMS_PER_PAGE}
        skip: $skip
        where: { market: $marketAddress, timestamp_gte: $sinceDate }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        market
        pendlePerSec
        incentiveEndsAt
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
  return result.data.rewardUpdates || [];
}

/**
 * Fetches all reward rate updates for a market
 */
async function getMarketRewardUpdates(marketAddress: string, sinceDate: number): Promise<RewardUpdateInfo[]> {
  try {
    // Implement pagination to handle more than 1000 rows
    let allUpdates: any[] = [];
    let currentPage = 0;
    let hasMoreData = true;
    
    while (hasMoreData) {
      const skip = currentPage * MAX_ITEMS_PER_PAGE;
      const updates = await fetchRewardUpdatesPage(marketAddress, sinceDate, skip);
      
      allUpdates = [...allUpdates, ...updates];
      currentPage++;
      
      // If we received fewer items than the maximum, we've reached the end
      if (updates.length < MAX_ITEMS_PER_PAGE) {
        hasMoreData = false;
      }
      
      // Log progress for larger datasets
      console.log(`Fetched ${allUpdates.length} reward updates so far...`);
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
    return allUpdates.map((update: any) => ({
      id: update.id,
      market: getAddress(update.market),
      marketInfo,
      pendlePerSec: update.pendlePerSec,
      pendlePerSecFormatted: pendleTokenInfo && formatTokenAmount(update.pendlePerSec, pendleTokenInfo.decimals),
      incentiveEndsAt: new Date(parseInt(update.incentiveEndsAt) * 1000),
      timestamp: new Date(parseInt(update.timestamp) * 1000),
      blockNumber: update.blockNumber,
      token: pendleTokenInfo
    }));
  } catch (error) {
    console.error("Error fetching reward updates:", error);
    throw error;
  }
}


/**
 * Export data to TSV file
 */
async function exportToTsv(data: RewardUpdateInfo[], marketAddress: string, timeRange: string) {
  const exportDir = ensureExportDirectory();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = path.join(exportDir, `${timestamp}_reward_updates_${marketAddress.substring(0, 8)}_${timeRange}.tsv`);
  
  // Generate market header
  const header = await formatMarketHeader(marketAddress);
  
  // Create TSV content
  const tableHeaders = ['Timestamp', 'Date', 'Market', 'PENDLE/sec', 'Incentive Ends At', 'Incentive Duration (Days)', 'Block Number'];
  
  const rows = data.map(update => {
    // Calculate incentive duration in days
    const incentiveStart = update.timestamp;
    const incentiveEnd = update.incentiveEndsAt;
    const durationMs = incentiveEnd.getTime() - incentiveStart.getTime();
    const durationDays = (durationMs / (1000 * 60 * 60 * 24)).toFixed(1);
    
    return [
      update.timestamp.toISOString(),
      update.timestamp.toLocaleString(),
      update.market,
      update.pendlePerSecFormatted,
      update.incentiveEndsAt.toISOString(),
      durationDays,
      update.blockNumber
    ];
  });
  
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
  
  console.log(`Fetching reward updates for market ${marketAddress} since ${timeRange}...`);
  
  // Get market header info for console display
  const headerInfo = await formatMarketHeader(marketAddress);
  console.log(headerInfo);
  
  const sinceDate = getTimestamp(timeRange);
  const updates = await getMarketRewardUpdates(marketAddress, sinceDate);
  
  console.log(`\nFound ${updates.length} reward updates`);
  
  // Display the latest update
  if (updates.length > 0) {
    console.log(`\n=== Latest Update ===`);
    const latest = updates[0];
    console.log(`Date: ${latest.timestamp.toLocaleString()}`);
    console.log(`PENDLE/sec: ${latest.pendlePerSecFormatted}`);
    console.log(`Incentive ends at: ${latest.incentiveEndsAt.toLocaleString()}`);
    
    // Calculate incentive duration
    const durationMs = latest.incentiveEndsAt.getTime() - latest.timestamp.getTime();
    const durationDays = (durationMs / (1000 * 60 * 60 * 24)).toFixed(1);
    console.log(`Incentive duration: ${durationDays} days`);
  }
  
  // Calculate average reward rate if there are multiple updates
  if (updates.length > 1) {
    const totalPendlePerSec = updates.reduce((sum, update) => {
      return sum + BigInt(update.pendlePerSec);
    }, BigInt(0));
    
    const avgPendlePerSec = totalPendlePerSec / BigInt(updates.length);
    
    if (updates[0].token) {
      console.log(`\nAverage PENDLE/sec: ${formatTokenAmount(avgPendlePerSec.toString(), updates[0].token.decimals)} over ${updates.length} updates`);
    }
  }
  
  // Export to TSV
  const exportedFile = await exportToTsv(updates, marketAddress, timeRange);
  console.log(`\nReport saved to: ${exportedFile}`);
}

if (import.meta.url === import.meta.resolve('./rewardUpdates.ts')) {
  main().catch(console.error);
}

export { getMarketRewardUpdates };