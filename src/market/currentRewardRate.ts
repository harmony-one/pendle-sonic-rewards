// currentRewardRate.ts - For getting current reward rates
import { Address, getAddress } from 'viem';
import { RewardRateInfo } from '../types';
import { getGaugeController, getMarketInfo, getTokenInfo } from '../web3/helper';
import { formatTokenAmount } from '../web3/numberUtils';
import * as fs from 'fs';
import * as path from 'path';
import { ensureExportDirectory } from '../helper';
import coinGeckoService from '../web3/api/coinGecko';

/**
 * Gets the current reward rate information for a market
 */
async function getCurrentRewardRate(marketAddress: string): Promise<RewardRateInfo> {
  try {
    // Get the gauge controller and query reward data
    const gaugeController = await getGaugeController();
    
    const rewardData = await gaugeController.read.rewardData([getAddress(marketAddress)]) as [string, string, string, string];
    // Get PENDLE token info
    const pendleTokenAddress = await gaugeController.read.pendle();
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress as Address);
    
    // Get market info
    const marketInfo = await getMarketInfo(
      getAddress(marketAddress)
    );
    
    // Calculate APR based on pendlePerSec
    const pendlePerSec = BigInt(rewardData[0]); // pendlePerSec is first value in tuple
    const pendlePerYear = pendlePerSec * BigInt(365 * 24 * 60 * 60);
    const pendlePrice = await coinGeckoService.getPendlePrice()
    
    // Estimate APR using TVL
    let estimatedAPR = "Requires TVL data for calculation";
    
    try {
      const marketTVL = 1 // await getMarketTVL(marketAddress);
      if (marketTVL && marketTVL > 0 && pendlePrice > 0) {
        const yearlyRewardsInUsd = Number(formatTokenAmount(pendlePerYear.toString(), pendleTokenInfo?.decimals || 18)) * pendlePrice;
        const aprPercentage = (yearlyRewardsInUsd / marketTVL) * 100;
        estimatedAPR = `${aprPercentage.toFixed(2)}%`;
      }
    } catch (error) {
      console.warn("Could not calculate estimated APR:", error);
    }
    
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
      pendlePrice: pendlePrice,
      estimatedRewardAPR: estimatedAPR
    };
  } catch (error) {
    console.error("Error fetching current reward rate:", error);
    throw error;
  }
}

/**
 * Format a market summary header for the TSV file
 */
async function formatMarketHeader(marketAddress: string, rewardRate: RewardRateInfo) {
  try {
    // Calculate time until incentive ends
    const now = new Date();
    const incentiveEnd = rewardRate.incentiveEndsAt;
    const msUntilEnd = Math.max(0, incentiveEnd.getTime() - now.getTime());
    const daysUntilEnd = Math.floor(msUntilEnd / (1000 * 60 * 60 * 24));
    const hoursUntilEnd = Math.floor((msUntilEnd % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    // Try to get the TVL
    let tvlInfo = "N/A";
    try {
      const tvl = 1 // await getMarketTVL(marketAddress);
      tvlInfo = `$${tvl.toLocaleString()}`;
    } catch (error) {
      console.warn("Could not retrieve TVL:", error);
    }
    
    // Build header
    const headerLines = [
      `# Current Reward Rate Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# Market: ${marketAddress}`,
      `# `,
      `# Principal Token: ${rewardRate.marketInfo.principalToken?.symbol || 'N/A'} (${rewardRate.marketInfo.principalToken?.address || 'N/A'})`,
      `# Standardized Yield: ${rewardRate.marketInfo.standardizedYield?.symbol || 'N/A'} (${rewardRate.marketInfo.standardizedYield?.address || 'N/A'})`,
      `# Yield Token: ${rewardRate.marketInfo.yieldToken?.symbol || 'N/A'} (${rewardRate.marketInfo.yieldToken?.address || 'N/A'})`,
      `# `,
      `# Current PENDLE reward rate: ${rewardRate.pendlePerSecFormatted} PENDLE/second`,
      `# PENDLE price: $${rewardRate.pendlePrice?.toFixed(4) || 'N/A'}`,
      `# Estimated APR: ${rewardRate.estimatedRewardAPR}`,
      `# Estimated TVL: ${tvlInfo}`,
      `# `,
      `# Accumulated unclaimed PENDLE: ${rewardRate.accumulatedPendleFormatted}`,
      `# Last updated: ${rewardRate.lastUpdated.toISOString()}`,
      `# Incentive ends in: ${daysUntilEnd} days, ${hoursUntilEnd} hours (${incentiveEnd.toISOString()})`,
      `# `,
      `# Reward tokens: ${rewardRate.marketInfo.rewardTokens.map(t => t.symbol).join(', ')}`,
      `# `
    ];
    
    return headerLines.join('\n');
  } catch (error) {
    console.error("Error creating market header:", error);
    return `# Current Reward Rate Report\n# Generated: ${new Date().toISOString()}\n# Market: ${marketAddress}\n# Error retrieving market details`;
  }
}

/**
 * Export data to TSV file
 */
async function exportToTsv(data: RewardRateInfo, marketAddress: string) {
  const exportDir = ensureExportDirectory();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = path.join(exportDir, `${timestamp}_current_reward_rate_${marketAddress.substring(0, 8)}.tsv`);
  
  // Generate market header
  const header = await formatMarketHeader(marketAddress, data);
  
  // Create TSV content
  const tableHeaders = [
    'Market', 
    'PENDLE/sec', 
    'PENDLE/year', 
    'PENDLE Price', 
    'Est. APR',
    'Accumulated PENDLE', 
    'Last Updated', 
    'Incentive Ends At',
    'PT Symbol',
    'SY Symbol',
    'YT Symbol',
    'Reward Tokens'
  ];
  
  const pendlePerYear = BigInt(data.pendlePerSec) * BigInt(365 * 24 * 60 * 60);
  const pendlePerYearFormatted = data.pendleToken ? formatTokenAmount(pendlePerYear.toString(), data.pendleToken.decimals) : 'N/A';
  
  const row = [
    data.market,
    data.pendlePerSecFormatted,
    pendlePerYearFormatted,
    data.pendlePrice ? `$${data.pendlePrice.toFixed(4)}` : 'N/A',
    data.estimatedRewardAPR,
    data.accumulatedPendleFormatted,
    data.lastUpdated.toISOString(),
    data.incentiveEndsAt.toISOString(),
    data.marketInfo.principalToken?.symbol || 'N/A',
    data.marketInfo.standardizedYield?.symbol || 'N/A',
    data.marketInfo.yieldToken?.symbol || 'N/A',
    data.marketInfo.rewardTokens.map(t => t.symbol).join(',')
  ];
  
  const tsvContent = [
    header,
    tableHeaders.join('\t'),
    row.join('\t')
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
  
  if (!marketAddress) {
    console.error('Please provide a market address');
    process.exit(1);
  }
  
  console.log(`Fetching current reward rate for market ${marketAddress}...`);
  
  const currentRate = await getCurrentRewardRate(marketAddress);
  
  // Display current reward rate
  console.log('\n=== Current Reward Rate ===');
  console.log(`Market: ${currentRate.market}`);
  console.log(`PENDLE per second: ${currentRate.pendlePerSecFormatted}`);
  console.log(`PENDLE price: $${currentRate.pendlePrice?.toFixed(4) || 'N/A'}`);
  console.log(`Estimated APR: ${currentRate.estimatedRewardAPR}`);
  console.log(`Accumulated PENDLE: ${currentRate.accumulatedPendleFormatted}`);
  console.log(`Last updated: ${currentRate.lastUpdated.toLocaleString()}`);
  console.log(`Incentive ends at: ${currentRate.incentiveEndsAt.toLocaleString()}`);
  
  // Calculate days left in current incentive period
  const now = new Date();
  const endDate = currentRate.incentiveEndsAt;
  const daysLeft = Math.max(0, (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`Incentive period: ${daysLeft.toFixed(1)} days remaining`);
  
  // Market information
  console.log('\n=== Market Information ===');
  if (currentRate.marketInfo.principalToken) {
    console.log(`Principal Token: ${currentRate.marketInfo.principalToken.symbol} (${currentRate.marketInfo.principalToken.address})`);
  }
  if (currentRate.marketInfo.standardizedYield) {
    console.log(`Standardized Yield: ${currentRate.marketInfo.standardizedYield.symbol} (${currentRate.marketInfo.standardizedYield.address})`);
  }
  if (currentRate.marketInfo.yieldToken) {
    console.log(`Yield Token: ${currentRate.marketInfo.yieldToken.symbol} (${currentRate.marketInfo.yieldToken.address})`);
  }
  
  // Reward tokens
  console.log('\n=== Reward Tokens ===');
  currentRate.marketInfo.rewardTokens.forEach((token, index) => {
    console.log(`${index+1}. ${token.symbol} (${token.address})`);
  });
  
  // Export to TSV
  const exportedFile = await exportToTsv(currentRate, marketAddress);
  console.log(`\nReport saved to: ${exportedFile}`);
}

if (import.meta.url === import.meta.resolve('./currentRewardRate.ts')) {
  main().catch(console.error);
}

export { getCurrentRewardRate };