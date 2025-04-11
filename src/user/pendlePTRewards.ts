// pendlePTRewards.ts - Calculate and export Pendle PT rewards

import { Address, formatUnits } from "viem";
import ERC20_ABI from '../web3/abis/erc20.json';
import PENDLE_MARKET_ABI from '../web3/abis/PendleMarket.json';
import moment from "moment";
import { client } from "../web3/client";
import config from "../config";
import fs from 'fs';
import path from 'path';
import { getMarketInfo, getCurrentRewardRate, getGaugeController, getTokenInfo } from "../web3/helper";

/**
 * Calculate PT fixed yield rewards based solely on on-chain data
 * @param marketAddress Pendle market address
 * @param userAddress User's wallet address
 * @param routerAddress Pendle router address
 * @param purchaseDate Date when the position was purchased (optional)
 */
async function calculatePTFixedYieldOnChain(
  marketAddress: Address,
  userAddress: Address,
  routerAddress: Address,
  depositAmount?: number,
  purchaseDate?: Date
) {
  try {
    console.log("Getting on-chain data for PT fixed yield calculation...");
    
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
    
    // Step 2: Get token info and balances
    const [ptDecimals, ptSymbol, ptBalance] = await Promise.all([
      client.readContract({
        address: ptAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      client.readContract({
        address: ptAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      client.readContract({
        address: ptAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress]
      })
    ]);
    
    // Step 3: Get market state to analyze PT pricing
    const marketState = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'readState',
      args: [routerAddress]
    }) as any;
    
    console.log("Market state:", {
      totalPt: marketState.totalPt.toString(),
      totalSy: marketState.totalSy.toString(),
      totalLp: marketState.totalLp.toString(),
      lastLnImpliedRate: marketState.lastLnImpliedRate.toString()
    });
    
    // Step 4: Calculate time parameters
    const currentTime = Math.floor(Date.now() / 1000);
    const secondsToMaturity = Math.max(0, Number(expiry) - currentTime);
    const daysToMaturity = secondsToMaturity / (60 * 60 * 24);
    
    // Calculate purchase time parameters if provided
    const purchaseTimestamp = purchaseDate ? Math.floor(purchaseDate.getTime() / 1000) : currentTime;
    const secondsFromPurchaseToMaturity = Math.max(0, Number(expiry) - purchaseTimestamp);
    const daysFromPurchaseToMaturity = secondsFromPurchaseToMaturity / (60 * 60 * 24);
    const daysSincePurchase = (currentTime - purchaseTimestamp) / (60 * 60 * 24);
    
    console.log("Time calculations:", {
      currentTime,
      purchaseTimestamp: purchaseTimestamp,
      expiry: Number(expiry),
      secondsToMaturity,
      daysToMaturity,
      daysSincePurchase: purchaseDate ? daysSincePurchase : 0,
      daysFromPurchaseToMaturity: purchaseDate ? daysFromPurchaseToMaturity : daysToMaturity
    });
    
    const impliedRateLn = BigInt(marketState.lastLnImpliedRate.toString());
    const normalizedLnRate = Number(impliedRateLn) / 1e18;
    
    // The implied rate is what determines the PT price discount
    // In Pendle's documentation, this approximates a yearly yield rate
    const impliedRate = Math.exp(normalizedLnRate);
    
    const impliedRatePercentage = (Math.exp(normalizedLnRate) - 1) * 100;

    const annualizedRate = impliedRatePercentage; 
    
    console.log("Implied rate calculations:", {
      rawLnRate: impliedRateLn.toString(),
      normalizedLnRate,
      impliedRate,
      annualizedRate
    });
    

    let ptPrice;
    
    if (daysToMaturity <= 0) {
      // At or past maturity
      ptPrice = 1.0;
    } else {
      // This formula matches Pendle's pricing model: PT approaches 1.0 at maturity
      // PT price = 1 / (1 + rate * timeToMaturity/365)
      ptPrice = 1.0 / (1.0 + (annualizedRate/100) * (daysToMaturity / 365));
      
    }
    
    console.log("Calculated PT price:", ptPrice);
    
    //Get user's PT balance
    const currentPtTokens = Number(formatUnits(ptBalance as bigint, Number(ptDecimals)));
    console.log(`User holds ${currentPtTokens} ${ptSymbol}`);
    
    // Handle deposit amount if provided
    let ptTokens = currentPtTokens;
    let estimatedPurchasePrice;
    
    if (depositAmount && depositAmount > 0) {
      // If purchase date provided, calculate purchase price
      if (purchaseDate) {
        estimatedPurchasePrice = 1.0 / (1.0 + (annualizedRate/100) * (daysFromPurchaseToMaturity / 365));
        estimatedPurchasePrice = Math.max(0.95, Math.min(0.99, estimatedPurchasePrice));
        
        // Calculate tokens based on deposit amount and purchase price
        ptTokens = depositAmount / estimatedPurchasePrice;
      } else {
        // No purchase date, use current price
        ptTokens = depositAmount / ptPrice;
        estimatedPurchasePrice = ptPrice;
      }
    } else {
      // No deposit amount, use current balance and price
      estimatedPurchasePrice = ptPrice;
    }
    
    if (ptTokens <= 0) {
      console.log("No PT tokens data available");
      return null;
    }
    
    const fixedAPY = annualizedRate; // Use the same annualized rate
    
    // Calculate values
    const valueAtMaturity = ptTokens * 1.0;
    const estimatedCurrentValue = ptTokens * ptPrice;
    const estimatedInitialValue = ptTokens * estimatedPurchasePrice;
    
    return {
      marketAddress,
      ptAddress,
      ptSymbol,
      ptTokens,
      ptPrice,
      estimatedPurchasePrice,
      maturityDate: moment(expiryDate).format('YYYY-MM-DD'),
      purchaseDate: purchaseDate ? moment(purchaseDate).format('YYYY-MM-DD') : null,
      daysToMaturity,
      daysFromPurchaseToMaturity: purchaseDate ? daysFromPurchaseToMaturity : daysToMaturity,
      daysSincePurchase: purchaseDate ? daysSincePurchase : 0,
      impliedRate: {
        raw: marketState.lastLnImpliedRate.toString(),
        normalized: normalizedLnRate,
        annualized: annualizedRate
      },
      fixedAPY: parseFloat(fixedAPY.toFixed(2)),
      valueAtMaturity: parseFloat(valueAtMaturity.toFixed(4)),
      estimatedCurrentValue: parseFloat(estimatedCurrentValue.toFixed(4)),
      estimatedInitialValue: parseFloat(estimatedInitialValue.toFixed(4)),
      depositAmount: depositAmount || null,
      projectedGain: {
        absolute: parseFloat((valueAtMaturity - estimatedInitialValue).toFixed(4)),
        percentage: parseFloat((((valueAtMaturity / estimatedInitialValue) - 1) * 100).toFixed(2))
      }
    };
  } catch (error) {
    console.error("Error calculating PT fixed yield from on-chain data:", error);
    throw error;
  }
}

/**
 * Format a market summary header for the TSV file
 */
export async function formatPTMarketHeader(marketAddress: string, result: any) {
  try {
    const marketInfo = await getMarketInfo(marketAddress as Address);
    
    // Build header
    const headerLines = [
      `# Pendle PT Rewards Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# Market: ${marketAddress} (${result.ptSymbol})`,
      `# `,
      `# Principal Token: ${marketInfo.principalToken?.symbol || 'N/A'} (${marketInfo.principalToken?.address || 'N/A'})`,
      `# Standardized Yield: ${marketInfo.standardizedYield?.symbol || 'N/A'} (${marketInfo.standardizedYield?.address || 'N/A'})`,
      `# Yield Token: ${marketInfo.yieldToken?.symbol || 'N/A'} (${marketInfo.yieldToken?.address || 'N/A'})`,
      `# `,
      `# Implied Rate (annualized): ${result.impliedRate.annualized.toFixed(2)}%`,
      `# Calculated Fixed APY: ${result.fixedAPY.toFixed(2)}%`,
      `# PT Price (calculated): ${result.ptPrice.toFixed(6)}`,
      `# Maturity Date: ${result.maturityDate} (${result.daysToMaturity.toFixed(2)} days remaining)`,
      `# `,
      `# User holds ${result.ptTokens.toFixed(6)} ${result.ptSymbol}`,
      `# Estimated Initial Value: $${result.estimatedInitialValue.toFixed(4)}`,
      `# Current Value: $${result.estimatedCurrentValue.toFixed(4)}`,
      `# Value at Maturity: $${result.valueAtMaturity.toFixed(4)}`,
      `# Projected Gain: $${result.projectedGain.absolute.toFixed(4)} (${result.projectedGain.percentage.toFixed(2)}%)`,
      `# `
    ];
    
    return headerLines.join('\n');
  } catch (error) {
    console.error("Error creating market header:", error);
    return `# Pendle PT Rewards Report\n# Generated: ${new Date().toISOString()}\n# Market: ${marketAddress}\n# Error retrieving market details`;
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
 * Export PT rewards data to TSV file
 */
async function exportPTRewardsToTsv(result: any, userAddress: string) {
  const exportDir = ensureExportDirectory();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = path.join(exportDir, `${timestamp}_pt_rewards_${result.marketAddress.substring(0, 8)}.tsv`);
  
  // Generate market header (keep this for documentation)
  const header = await formatPTMarketHeader(result.marketAddress, result);
  
  // Create a simpler TSV format with a single header row and data row
  // This avoids duplication while maintaining a proper TSV structure
  const headerRow = [
    'Market Address',
    'PT Symbol',
    'Maturity Date',
    'Days To Maturity',
    'PT Price',
    'PT Balance',
    'Estimated Purchase Price',
    'Deposit Amount',
    'Implied Rate (%)',
    'Fixed APY (%)',
    'Current Value',
    'Value at Maturity',
    'Projected Gain (%)'
  ].join('\t');
  
  const dataRow = [
    result.marketAddress,
    result.ptSymbol,
    result.maturityDate,
    result.daysToMaturity.toFixed(2),
    result.ptPrice.toFixed(6),
    result.ptTokens.toFixed(6),
    result.estimatedPurchasePrice.toFixed(6),
    result.depositAmount || 'Unknown',
    result.impliedRate.annualized.toFixed(2),
    result.fixedAPY.toFixed(2),
    result.estimatedCurrentValue.toFixed(4),
    result.valueAtMaturity.toFixed(4),
    result.projectedGain.percentage.toFixed(2)
  ].join('\t');
  
  // Combine the header comments with the TSV content
  const tsvContent = [
    header,  // Keep this as informative comments
    headerRow,
    dataRow
  ].join('\n');
  
  fs.writeFileSync(filename, tsvContent);
  console.log(`Data exported to ${filename}`);
  return filename;
}


/**
 * Generate formatted console report
 */
function generateConsoleReport(result: any) {
  console.log("\n==== PENDLE PT REWARDS ANALYSIS ====");
  console.log(`Market: ${result.ptSymbol} (${result.marketAddress})`);
  console.log(`Maturity Date: ${result.maturityDate} (${result.daysToMaturity.toFixed(2)} days remaining)`);
  
  console.log("\n--- User Position ---");
  console.log(`PT Token Balance: ${result.ptTokens.toFixed(6)}`);
  console.log(`Estimated Initial Value: $${result.estimatedInitialValue.toFixed(4)}`);
  console.log(`Current Value (on-chain price): $${result.estimatedCurrentValue.toFixed(4)}`);
  console.log(`Value at Maturity: $${result.valueAtMaturity.toFixed(4)}`);
  
  console.log("\n--- Reward Analysis ---");
  console.log(`Implied Rate (annualized): ${result.impliedRate.annualized.toFixed(2)}%`);
  console.log(`On-Chain PT Price: $${result.ptPrice.toFixed(4)}`);
  console.log(`Estimated Purchase Price: $${result.estimatedPurchasePrice.toFixed(4)}`);
  console.log(`Fixed APY (calculated): ${result.fixedAPY.toFixed(2)}%`);
  console.log(`Projected Gain at Maturity: $${result.projectedGain.absolute.toFixed(4)} (${result.projectedGain.percentage.toFixed(2)}%)`);
  
  console.log("\n--- Verification Notes ---");
  console.log("1. PT tokens don't generate claimable rewards - yield comes from price appreciation");
  console.log("2. The fixed APY represents annualized return if held to maturity");
  console.log("3. Current market yield is based on implied rate from the Pendle market");
  console.log("4. Actual returns may vary based on exact purchase price and hold duration");
  console.log("=====================================");
  
  return {
    summary: `PT-wstkscUSD current yield: ${result.fixedAPY.toFixed(2)}% APY, maturing in ${result.daysToMaturity.toFixed(0)} days`,
    recommendation: "PT token positions do not require any reward claiming and will automatically realize their full value at maturity."
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
  const depositAmount = args[2];
  const depositDate = args[3];
  
  if (!marketAddress || !userAddress) {
    console.error('Missing required arguments');
    console.error('Usage: yarn run user:pt:rewards <marketAddress> <userAddress> [depositAmount] [depositDate]');
    console.error('Example: yarn run user:pt:rewards 0x6e4e95fab7db1f0524b4b0a05f0b9c96380b7dfa 0x123... 10 "2025-04-01"');
    process.exit(1);
  }
  
  console.log(`Calculating PT rewards for market ${marketAddress} and user ${userAddress}...`);
  
  try {
    // Parse purchase date if provided
    const purchaseDate = depositDate ? new Date(depositDate) : undefined;
    
    // Perform the calculation
    const routerAddress = config.contracts.pendleRouter as Address;
    const result = await calculatePTFixedYieldOnChain(
      marketAddress,
      userAddress,
      routerAddress,
      Number(depositAmount),
      purchaseDate
    );
    
    if (!result) {
      console.log("No PT tokens found for this user address.");
      process.exit(0);
    }
    
    // Generate console report
    generateConsoleReport(result);
    
    // Export to TSV
    const exportedFile = await exportPTRewardsToTsv(result, userAddress);
    console.log(`\nReport saved to: ${exportedFile}`);
    
    return result;
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (import.meta.url === import.meta.resolve('./pendlePTRewards.ts')) {
  main().catch(console.error);
}

export { calculatePTFixedYieldOnChain, generateConsoleReport };