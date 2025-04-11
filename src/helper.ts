import path from "path";
import { getCurrentRewardRate, getGaugeController, getMarketInfo, getTokenInfo } from "./web3/helper";
import { Address, getAddress } from "viem";
import { formatTokenAmount } from "./web3/numberUtils";
import * as fs from 'fs';

/**
 * Calculate timestamp for different time ranges
 */
export function getTimestamp(timeRange: string): number {
  const now = Math.floor(Date.now() / 1000);
  switch (timeRange.toLowerCase()) {
    case 'day':
      return now - 24 * 60 * 60;
    case 'week':
      return now - 7 * 24 * 60 * 60;
    case 'month':
      return now - 30 * 24 * 60 * 60;
    case 'all':
      return 0;
    default:
      // Try to parse as a specific date in YYYY-MM-DD format
      try {
        const date = new Date(timeRange);
        if (!isNaN(date.getTime())) {
          return Math.floor(date.getTime() / 1000);
        }
      } catch (e) {
        // If parsing fails, default to a month
      }
      return now - 30 * 24 * 60 * 60;
  }
}

/**
 * Format a market summary header for the TSV file
 */
export async function formatMarketHeader(marketAddress: string) {
  try {
    const marketInfo = await getMarketInfo(getAddress(marketAddress));
    const rewardRate = await getCurrentRewardRate(marketAddress);
    
    // Calculate time until incentive ends
    const now = new Date();
    const incentiveEnd = rewardRate.incentiveEndsAt;
    const msUntilEnd = Math.max(0, incentiveEnd.getTime() - now.getTime());
    const daysUntilEnd = Math.floor(msUntilEnd / (1000 * 60 * 60 * 24));
    const hoursUntilEnd = Math.floor((msUntilEnd % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    // Get token info
    const gaugeController = await getGaugeController();
    const pendleTokenAddress = await gaugeController.read.pendle();
    const pendleTokenInfo = await getTokenInfo(pendleTokenAddress as Address);
    
    // Format reward rate
    const pendlePerSecFormatted = pendleTokenInfo 
      ? formatTokenAmount(rewardRate.pendlePerSec, pendleTokenInfo.decimals)
      : rewardRate.pendlePerSec;
    
    // Build header
    const headerLines = [
      `# Market Rewards Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# Market: ${marketAddress}`,
      `# `,
      `# Principal Token: ${marketInfo.principalToken?.symbol || 'N/A'} (${marketInfo.principalToken?.address || 'N/A'})`,
      `# Standardized Yield: ${marketInfo.standardizedYield?.symbol || 'N/A'} (${marketInfo.standardizedYield?.address || 'N/A'})`,
      `# Yield Token: ${marketInfo.yieldToken?.symbol || 'N/A'} (${marketInfo.yieldToken?.address || 'N/A'})`,
      `# `,
      `# Current PENDLE reward rate: ${pendlePerSecFormatted} PENDLE/second`,
      `# Incentive ends in: ${daysUntilEnd} days, ${hoursUntilEnd} hours (${incentiveEnd.toISOString()})`,
      `# `,
      `# Reward tokens: ${marketInfo.rewardTokens.map(t => t.symbol).join(', ')}`,
      `# `
    ];
    
    return headerLines.join('\n');
  } catch (error) {
    console.error("Error creating market header:", error);
    return `# Market Rewards Report\n# Generated: ${new Date().toISOString()}\n# Market: ${marketAddress}\n# Error retrieving market details`;
  }
}

/**
 * Create export directory if it doesn't exist
 */
export function ensureExportDirectory() {
  const dir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
