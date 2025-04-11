// getUserRewards.ts - For getting user claimed rewards
import { Address, getAddress } from 'viem';
import config from '../config';
import { RedeemEventInfo, RewardInfo, SubgraphResponse } from '../types';
import { getGaugeController, getMarketInfo, getTokenInfo } from '../web3/helper';
import { formatTokenAmount } from '../web3/numberUtils';
import * as fs from 'fs';
import * as path from 'path';
import { ensureExportDirectory, getTimestamp } from '../helper';

const SUBGRAPH_URL = config.graphUrl;
const MAX_ITEMS_PER_PAGE = 1000;

/**
 * Fetches reward redemptions for a user with pagination
 */
async function fetchUserRewardsPage(
  userAddress: string,
  sinceDate: number,
  skip: number = 0
): Promise<any[]> {
  const normalizedAddress = userAddress.toLowerCase();
  
  const query = `
    query GetUserRewards($userAddress: Bytes!, $sinceDate: BigInt!, $skip: Int!) {
      redeemRewards_collection(
        first: ${MAX_ITEMS_PER_PAGE}
        skip: $skip
        where: { 
          user: $userAddress, 
          blockTimestamp_gte: $sinceDate 
        }
        orderBy: blockTimestamp
        orderDirection: desc
      ) {
        id
        user
        blockTimestamp
        transactionHash
        market {
          id
          address
          principalToken
          createdAt
        }
        rewards {
          id
          token
          amount
        }
      }
    }
  `;
  
  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: {
        userAddress: normalizedAddress,
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
  
  return result.data?.redeemRewards_collection || [];
}

/**
 * Fetches all reward redemptions for a user with pagination
 */
async function getUserRewardRedemptions(userAddress: string, sinceDate: number): Promise<RedeemEventInfo[]> {
  try {
    // Implement pagination to handle more than 1000 rows
    let allRedeemEvents: any[] = [];
    let currentPage = 0;
    let hasMoreData = true;
    
    while (hasMoreData) {
      const skip = currentPage * MAX_ITEMS_PER_PAGE;
      const redeemEvents = await fetchUserRewardsPage(userAddress, sinceDate, skip);
      
      allRedeemEvents = [...allRedeemEvents, ...redeemEvents];
      currentPage++;
      
      // If we received fewer items than the maximum, we've reached the end
      if (redeemEvents.length < MAX_ITEMS_PER_PAGE) {
        hasMoreData = false;
      }
      
      // Log progress for larger datasets
      console.log(`Fetched ${allRedeemEvents.length} reward redemption events so far...`);
    }
    
    // Enrich the data with contract calls
    const enrichedEvents: RedeemEventInfo[] = [];
    
    for (const event of allRedeemEvents) {
      // Get market info with PT, YT, SY details
      const marketInfo = await getMarketInfo(
        getAddress(event.market.address),
      );
      
      // Enrich reward info
      const rewardTokenAddresses = marketInfo.rewardTokens.map(token => token.address);
     
      // Enrich reward info
      const enrichedRewards: RewardInfo[] = [];

      for (const reward of event.rewards) {
        // Parse the token index from the token field
        let tokenIndex = 0;
        if (reward.token.startsWith('0x')) {
          tokenIndex = parseInt(reward.token.slice(2, 4), 16);
        }
        
        // Get the actual token address using the index
        const tokenAddress = tokenIndex < rewardTokenAddresses.length 
          ? rewardTokenAddresses[tokenIndex] 
          : '0x0000000000000000000000000000000000000000';
        const tokenInfo = await getTokenInfo(getAddress(tokenAddress));
        if (tokenInfo) {
          const amountFormatted = formatTokenAmount(reward.amount, tokenInfo.decimals);
        
          enrichedRewards.push({
            token: tokenInfo,
            amount: reward.amount,
            amountFormatted,
          });
        }
      }
      
      enrichedEvents.push({
        id: event.id,
        user: getAddress(event.user),
        timestamp: new Date(parseInt(event.blockTimestamp) * 1000),
        transactionHash: event.transactionHash,
        market: {
          ...marketInfo,
          createdAt: new Date(parseInt(event.market.createdAt) * 1000),
        },
        rewards: enrichedRewards,
      });
    }
    
    return enrichedEvents;
  } catch (error) {
    console.error("Error fetching user rewards:", error);
    throw error;
  }
}

async function formatUserHeader(userAddress: string, redemptions: RedeemEventInfo[]) {
  try {
    const gaugeController = await getGaugeController();
    const pendleTokenAddress = await gaugeController.read.pendle();
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress as Address);
    
    // Get unique markets from redemptions
    const uniqueMarkets = new Map();
    for (const event of redemptions) {
      if (!uniqueMarkets.has(event.market.address)) {
        uniqueMarkets.set(event.market.address, event.market);
      }
    }
    
    // Build header
    const headerLines = [
      `# User Rewards Redemption Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# User Address: ${userAddress}`,
      `# `,
      `# This report contains all PENDLE reward redemptions by this user`,
      `# along with SY token rewards (rewards from the underlying yield source)`,
      `# `,
    ];
    
    // Add market information to header
    if (uniqueMarkets.size > 0) {
      headerLines.push(`# Markets with redemptions:`);
      
      for (const market of uniqueMarkets.values()) {
        headerLines.push(`# `);
        headerLines.push(`# Market: ${market.address} (${market.principalToken?.symbol || 'Unknown Market'})`);
        
        if (market.principalToken) {
          headerLines.push(`# Principal Token (PT): ${market.principalToken.symbol} (${market.principalToken.address})`);
        }
        
        if (market.yieldToken) {
          headerLines.push(`# Yield Token (YT): ${market.yieldToken.symbol} (${market.yieldToken.address})`);
        }
        
        if (market.standardizedYield) {
          headerLines.push(`# Standardized Yield (SY): ${market.standardizedYield.symbol} (${market.standardizedYield.address})`);
        }
      }
      
      headerLines.push(`# `);
    }
    
    // Add info about reward tokens
    const rewardTokens = new Set();
    for (const event of redemptions) {
      for (const reward of event.rewards) {
        rewardTokens.add(`${reward.token.symbol} (${reward.token.address})`);
      }
    }
    
    if (rewardTokens.size > 0) {
      headerLines.push(`# Reward tokens: ${Array.from(rewardTokens).join(', ')}`);
      headerLines.push(`# `);
    }
    
    return headerLines.join('\n');
  } catch (error) {
    console.error("Error creating user header:", error);
    return `# User Rewards Redemption Report\n# Generated: ${new Date().toISOString()}\n# User Address: ${userAddress}\n# Error retrieving user details`;
  }
}

/**
 * Get total rewards value for a user
 */
async function getTotalRewardsValue(userRedemptions: RedeemEventInfo[]): Promise<Record<string, { total: string, symbol: string }>> {
  // Aggregate rewards by token
  const totals: Record<string, { amount: bigint, decimals: number, symbol: string }> = {};
  
  for (const redemption of userRedemptions) {
    for (const reward of redemption.rewards) {
      const tokenAddress = reward.token.address;
      
      if (!totals[tokenAddress]) {
        totals[tokenAddress] = { 
          amount: BigInt(0), 
          decimals: reward.token.decimals,
          symbol: reward.token.symbol 
        };
      }
      
      totals[tokenAddress].amount += BigInt(reward.amount);
    }
  }
  
  // Format totals
  const formattedTotals: Record<string, { total: string, symbol: string }> = {};
  
  for (const [address, data] of Object.entries(totals)) {
    formattedTotals[address] = {
      total: formatTokenAmount(data.amount.toString(), data.decimals),
      symbol: data.symbol
    };
  }
  
  return formattedTotals;
}

/**
 * Export data to TSV file
 */
async function exportToTsv(data: RedeemEventInfo[], userAddress: string, timeRange: string) {
  const exportDir = ensureExportDirectory();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = path.join(exportDir, `${timestamp}_user_rewards_${userAddress.substring(0, 8)}_${timeRange}.tsv`);
  
  // Generate user header
  const header = await formatUserHeader(userAddress, data);
  
  // Create TSV content
  const tableHeaders = ['Timestamp', 'Date', 'Transaction Hash', 'Market', 'Market Address', 'Token', 'Amount'];
  
  const rows: string[][] = [];
  
  // Process each event and create multiple rows (one per reward)
  for (const event of data) {
    for (const reward of event.rewards) {
      rows.push([
        event.timestamp.toISOString(),
        event.timestamp.toLocaleString(),
        event.transactionHash,
        event.market.principalToken?.symbol || 'Unknown Market',
        event.market.address,
        reward.token.symbol,
        reward.amountFormatted
      ]);
    }
  }
  
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
  const userAddress = args[0];
  const timeRange = args[1] || 'month';
  
  if (!userAddress) {
    console.error('Please provide a user wallet address');
    process.exit(1);
  }
  
  console.log(`Fetching reward redemptions for user ${userAddress} since ${timeRange}...`);
  

  
  const sinceDate = getTimestamp(timeRange);
  const redemptions = await getUserRewardRedemptions(userAddress, sinceDate);

  console.log(`\nFound ${redemptions.length} redemption events`);
  
  // Display summary of rewards grouped by token
  console.log('\n=== Total Rewards Summary ===');
  const totals = await getTotalRewardsValue(redemptions);
  
  for (const [address, data] of Object.entries(totals)) {
    console.log(`${data.total} ${data.symbol} (${address})`);
  }
  
  // Display detailed information (limited to few for console readability)
  const MAX_DISPLAY = 5;
  if (redemptions.length > 0) {
    console.log(`\n=== Most Recent Redemption Events (showing ${Math.min(MAX_DISPLAY, redemptions.length)} of ${redemptions.length}) ===`);
    
    for (let i = 0; i < Math.min(MAX_DISPLAY, redemptions.length); i++) {
      const event = redemptions[i];
      console.log('\nRedemption Event:');
      console.log(`Date: ${event.timestamp.toLocaleString()}`);
      console.log(`Transaction: ${event.transactionHash}`);
      console.log(`Market: ${event.market.principalToken?.symbol || 'Unknown'} (${event.market.address})`);
      
      console.log('Rewards:');
      for (const reward of event.rewards) {
        console.log(`  ${reward.amountFormatted} ${reward.token.symbol}`);
      }
    }
  }
  
  // Export to TSV
  const exportedFile = await exportToTsv(redemptions, userAddress, timeRange);
  console.log(`\nReport saved to: ${exportedFile}`);
}

// Run the script when executed directly
if (import.meta.url === import.meta.resolve('./userRewards.ts')) {
  main().catch(console.error);
}

export { getUserRewardRedemptions, getTotalRewardsValue };