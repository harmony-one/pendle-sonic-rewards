import { getAddress, Address } from 'viem';
import config from './config';
import { MarketRewardInfo, RewardUpdateInfo, MarketInfo, RewardRateInfo } from './types';
import { getGaugeController, getMarketInfo, getTokenInfo } from './web3/helper';
import { formatTokenAmount } from './web3/numberUtils';

const SUBGRAPH_URL = config.graphUrl;

/**
 * Fetches all rewards claimed by a market
 */
async function getMarketClaimedRewards(marketAddress: string, sinceDate: number): Promise<MarketRewardInfo[]> {
  try {
    // Normalize the address
    const normalizedAddress = marketAddress.toLowerCase();
    
    // Fetch data from subgraph
    const query = `
      query GetMarketRewards($marketAddress: Bytes!, $sinceDate: BigInt!) {
        marketRewards: marketRewards(
          first: 1000
          where: { market: $marketAddress, timestamp_gte: $sinceDate  }
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

    // transactionHash
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          marketAddress: normalizedAddress,
          sinceDate: `${sinceDate}`
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    const marketRewards = result.data.marketRewards || [];
    
    // Get market info
    const marketInfo = await getMarketInfo(
      getAddress(marketAddress)
    );
    
    // Get PENDLE token info
    const gaugeController = getGaugeController()
    
    const pendleTokenAddress = await (await gaugeController).read.pendle() as Address;
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress);
    
    // Enrich the data
    return marketRewards.map((reward: any) => ({
      id: reward.id,
      market: getAddress(reward.market),
      marketInfo,
      amount: reward.amount,
      amountFormatted: pendleTokenInfo && formatTokenAmount(reward.amount, pendleTokenInfo.decimals),
      timestamp: new Date(parseInt(reward.timestamp) * 1000),
      blockNumber: reward.blockNumber,
      transactionHash: reward.transactionHash,
      token: pendleTokenInfo
    }));
  } catch (error) {
    console.error("Error fetching market rewards:", error);
    throw error;
  }
}

/**
 * Fetches all reward rate updates for a market
 */
async function getMarketRewardUpdates(marketAddress: string): Promise<RewardUpdateInfo[]> {
  try {
    // Normalize the address
    const normalizedAddress = marketAddress.toLowerCase();
    
    // Fetch data from subgraph
    const query = `
      query GetRewardUpdates($marketAddress: Bytes!) {
        rewardUpdates(
          where: { market: $marketAddress }
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
    // transactionHash
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          marketAddress: normalizedAddress,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    const rewardUpdates = result.data.rewardUpdates || [];
    
    // Get market info
    const marketInfo = await getMarketInfo(
      getAddress(marketAddress)
    );
    
    // Get PENDLE token info
    const gaugeController = getGaugeController()
    
    const pendleTokenAddress = await (await gaugeController).read.pendle() as Address;
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress);
    
    // Enrich the data
    return rewardUpdates.map((update: any) => ({
      id: update.id,
      market: getAddress(update.market),
      marketInfo,
      pendlePerSec: update.pendlePerSec,
      pendlePerSecFormatted: pendleTokenInfo && formatTokenAmount(update.pendlePerSec, pendleTokenInfo.decimals),
      incentiveEndsAt: new Date(parseInt(update.incentiveEndsAt) * 1000),
      timestamp: new Date(parseInt(update.timestamp) * 1000),
      blockNumber: update.blockNumber,
      transactionHash: update.transactionHash,
      token: pendleTokenInfo
    }));
  } catch (error) {
    console.error("Error fetching reward updates:", error);
    throw error;
  }
}

/**
 * Gets the current reward rate information for a market
 */
async function getCurrentRewardRate(marketAddress: string): Promise<RewardRateInfo> {
  try {
    // Get the gauge controller and query reward data
    const gaugeController = getGaugeController()
    
    const rewardData = await (await gaugeController).read.rewardData([getAddress(marketAddress)]) as [string, string, string, string];
    // Get PENDLE token info
    const pendleTokenAddress = await (await gaugeController).read.pendle() as Address;
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress);
    
    // Get market info
    const marketInfo = await getMarketInfo(
      getAddress(marketAddress)
    );
    
    // Calculate APR based on pendlePerSec
    const pendlePerSec = BigInt(rewardData[0]); // pendlePerSec is first value in tuple
    const pendlePerYear = pendlePerSec * BigInt(365 * 24 * 60 * 60);
    
    // Note: A more accurate APR calculation would require:
    // 1. Current price of PENDLE token
    // 2. Total value locked in the market
    // APR = (pendlePerYear * pendlePrice) / TVL * 100
    
    return {
      market: getAddress(marketAddress),
      marketInfo,
      pendlePerSec: rewardData[0].toString(),
      pendlePerSecFormatted: pendleTokenInfo ? formatTokenAmount(rewardData[0].toString(), pendleTokenInfo.decimals) : '',
      accumulatedPendle: rewardData[1].toString(),
      accumulatedPendleFormatted: pendleTokenInfo ? formatTokenAmount(rewardData[1].toString(), pendleTokenInfo.decimals) : '',
      lastUpdated: new Date(Number(rewardData[2]) * 1000),
      incentiveEndsAt: new Date(Number(rewardData[3]) * 1000),
      pendleToken: pendleTokenInfo,
      // This is a placeholder for actual APR calculation
      estimatedRewardAPR: "Requires price data for calculation"
    };
  } catch (error) {
    console.error("Error fetching current reward rate:", error);
    throw error;
  }
}


// Placeholder functions for price data - you'd need to implement these
async function getPTPrice(market: MarketInfo): Promise<bigint> {
  // Implementation would depend on your data sources
  return BigInt(1e18); // Placeholder
}

async function getSYPrice(market: MarketInfo): Promise<bigint> {
  // Implementation would depend on your data sources
  return BigInt(1e18); // Placeholder
}

/**
 * Gets all reward information for a market
 */
async function getAllMarketRewardInfo(marketAddress: string) {
  try {
    const oneMonthAgo = Math.floor(Date.now() / 1000) - 30 * 86400;

    const [claimedRewards, rewardUpdates, currentRate] = await Promise.all([
      getMarketClaimedRewards(marketAddress, oneMonthAgo),
      getMarketRewardUpdates(marketAddress),
      getCurrentRewardRate(marketAddress)
    ]);
    
    return {
      marketAddress: getAddress(marketAddress),
      currentRewardRate: currentRate,
      rewardUpdates: rewardUpdates,
      claimedRewards: claimedRewards,
    };
  } catch (error) {
    console.error("Error fetching all market reward info:", error);
    throw error;
  }
}

/**
 * Main function to demonstrate usage
 */
async function main() {
  // Replace with the market address and its principal token address you want to check
  const marketAddress = '0x3F5EA53d1160177445B1898afbB16da111182418';
  
  console.log(`Fetching reward information for market ${marketAddress}...`);
  
  const rewardInfo = await getAllMarketRewardInfo(marketAddress)
  
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
  for (const claim of rewardInfo.claimedRewards) {
    console.log(`[${claim.timestamp.toLocaleString()}] Claimed: ${claim.amountFormatted} ${claim.token.symbol}`);
    totalClaimed += BigInt(claim.amount);
  }
  
  // Show totals
  console.log('\n=== Summary ===');
  const pendleInfo = rewardInfo.currentRewardRate.pendleToken;
  pendleInfo && console.log(`Total PENDLE claimed: ${formatTokenAmount(totalClaimed.toString(), pendleInfo.decimals)} ${pendleInfo.symbol}`);
  pendleInfo && console.log(`Current reward rate: ${rewardInfo.currentRewardRate.pendlePerSecFormatted} ${pendleInfo.symbol}/second`);
  
  // Calculate days left in current incentive period
  const now = new Date();
  const endDate = rewardInfo.currentRewardRate.incentiveEndsAt;
  const daysLeft = Math.max(0, (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`Incentive period: ${daysLeft.toFixed(1)} days remaining`);
  // Market information
  console.log('\n=== Market Information ===');
  console.log(`Market: ${rewardInfo.marketAddress}`);
  if (rewardInfo.currentRewardRate.marketInfo.principalToken) {
    console.log(`Principal Token: ${rewardInfo.currentRewardRate.marketInfo.principalToken.symbol} (${rewardInfo.currentRewardRate.marketInfo.principalToken.address})`);
  } else {
    console.log(`Principal Token: ${rewardInfo.currentRewardRate.marketInfo.principalToken}`)
  }
  if (rewardInfo.currentRewardRate.marketInfo.standardizedYield) {
    console.log(`Standardized Yield: ${rewardInfo.currentRewardRate.marketInfo.standardizedYield.symbol} (${rewardInfo.currentRewardRate.marketInfo.standardizedYield.address})`);
  }
  if (rewardInfo.currentRewardRate.marketInfo.yieldToken) {
    console.log(`Yield Token: ${rewardInfo.currentRewardRate.marketInfo.yieldToken.symbol} (${rewardInfo.currentRewardRate.marketInfo.yieldToken.address})`);
  }
  
  // Reward tokens
  console.log('\n=== Reward Tokens ===');
  rewardInfo.currentRewardRate.marketInfo.rewardTokens.forEach((token, index) => {
    console.log(`${index+1}. ${token.symbol} (${token.address})`);
  });
}

main().catch(console.error);
