// src/aave/correctAaveApr.ts
import { Address } from 'viem';
import { client } from '../common/web3/client';
import fs from 'fs';
import path from 'path';
import poolAbi from './web3/abis/Pool.json';
import erc20Abi from './web3/abis/erc20.json';
import config from './web3/config';
import { ensureExportDirectory } from '../common/helper';
import { getTokenSymbol } from '../common/web3/helper';
import { formatTsvDate } from './helper';

const USDC_ADDRESS = config.contracts.usdcAddress
const AUSDC_TOKEN_ADDRESS = config.contracts.aUsdcAddress
const DEPOSIT_LINK = config.aavePoolUrl

export function formatMarketHeader(aprData: any) {
  try {    
    // Build header
    const headerLines = [
      `# Market Rewards Report`,
      `# Generated: ${new Date().toISOString()}`,
      `# Market: ${aprData.poolAddress}`,
      `# `,
      `# Contract APR: ${aprData.contractApr + '%'}`,
      `# Initial deposit: ${aprData.depositAmount}`,
      `# Current Balance: ${aprData.currentBalance}`,
      `# Interest earned: ${aprData.currentBalance - aprData.depositAmount} 'USDC'`,
      `# Days elapsed: ${aprData.daysElapsed}`,
      `# Observed APR: ${aprData.observedApr + '%'}`,
      `# `
    ];
    
    return headerLines.join('\n');
  } catch (error) {
    console.error("Error creating market header:", error);
    return `# Market Rewards Report\n# Generated: ${new Date().toISOString()}\n# Market: ${aprData.poolAddress}\n# Error retrieving market details`;
  }
}

async function exportToTsv(aprData: any) {
  try {
    console.log('Exporting Aave data to TSV...');
    const exportDir = ensureExportDirectory();
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = path.join(exportDir, `${timestamp}_aave_apr_${aprData.poolAddress.substring(0, 8)}_${aprData.userAddress.substring(0, 8)}.tsv`);
    // Create data directory if it doesn't exist
    if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
      fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
    }
        
    // Get token symbols
    const usdcSymbol = await getTokenSymbol(client, USDC_ADDRESS);
    const aTokenSymbol = await getTokenSymbol(client, AUSDC_TOKEN_ADDRESS);
    
    // Calculate days elapsed
    const currentTime = new Date();
    const daysElapsed = (currentTime.getTime() - aprData.depositDateMiliseconds) / (1000 * 60 * 60 * 24);
    
    // Extract APR (remove the % sign)
    const aprValue = parseFloat(aprData.observedApr.replace('%', ''));
    
    // Calculate rewards from the current balance
    const currentBalance = parseFloat(aprData.currentBalance.toString());
    const rewardAmount = currentBalance - aprData.depositAmount;
    
    // Estimate blocks (assuming average 2 second block time on Sonic)
    const blocksElapsed = Math.floor(daysElapsed * 24 * 60 * 30); // ~2 seconds per block
  
    const header = formatMarketHeader(aprData)

    const tableHeaders = 'name\taddress\tdeposit_time\tdeposit_asset0\tdeposit_asset1\tdeposit_amount0\tdeposit_amount1\tdeposit_value0\tdeposit_value1\tdeposit_value\treward_asset0\treward_asset1\treward_amount0\treward_amount1\treward_value0\treward_value1\treward_value\ttotal_days\ttotal_blocks\tapr\ttype\tdeposit_link';
  
    // Create TSV row
    const row = [
      'aave',                                      // name
      AUSDC_TOKEN_ADDRESS,                         // address
      formatTsvDate(aprData.depositDateMiliseconds),         // deposit_time
      usdcSymbol,                                  // deposit_asset0
      '',                                          // deposit_asset1
      aprData.depositAmount.toString(),                  // deposit_amount0
      '',                                          // deposit_amount1
      aprData.depositAmount.toString(),                  // deposit_value0
      '',                                          // deposit_value1
      aprData.depositAmount.toString(),                  // deposit_value
      aTokenSymbol,                                // reward_asset0
      '',                                          // reward_asset1
      rewardAmount.toFixed(8),                     // reward_amount0
      '',                                          // reward_amount1
      rewardAmount.toFixed(8),                     // reward_value0
      '',                                          // reward_value1
      rewardAmount.toFixed(8),                     // reward_value
      daysElapsed.toFixed(3),                      // total_days
      blocksElapsed.toString(),                    // total_blocks
      aprValue.toFixed(5),                         // apr
      'Lending',                                   // type
      DEPOSIT_LINK                                 // deposit_link
    ].join('\t') + '\n';
    
    const tsvContent = [
      header,
      tableHeaders,
      row
    ].join('\n');

    // Append to TSV file
    fs.appendFileSync(filename, tsvContent);
      
    // Also print the row for verification
    console.log('\nExported TSV row:');
    console.log(row);
    
    return {
      filePath: filename,
      rowCount: fs.readFileSync(filename, 'utf8').split('\n').length - 1
    };
    
  } catch (error) {
    console.error('Error exporting TSV:', error);
    throw error;
  }
}

/**
 * Calculate the correct Aave APR from both contract data and observed balance
 */
async function calculateApr(poolAddress: Address, userAddress: Address, depositAmount: number, depositDate: string) {
  try {
    console.log('Calculating Aave APR...\n');
    const depositDateMiliseconds = new Date(depositDate).getTime();
    // Get the reserve data
    const reserveData = await client.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: 'getReserveData',
      args: [USDC_ADDRESS],
    }) as any;
    
    // Extract the liquidity rate
    const liquidityRateRaw = reserveData.currentLiquidityRate;
    
    console.log('Raw liquidity rate:', liquidityRateRaw.toString());
    
    // CORRECT CALCULATION: The rate is expressed in RAY units (27 decimals)
    // and represents a yearly rate, not a per-second rate
    const yearlyRate = Number(liquidityRateRaw) / 1e27;
    const contractApr = yearlyRate * 100;
    
    console.log('Yearly rate:', yearlyRate);
    console.log('Contract APR:', contractApr.toFixed(4) + '%');
    
    // Get current aToken balance
    const decimals = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'decimals',
    }) as number;
    
    const currentBalance = await client.readContract({
      address: AUSDC_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [userAddress],
    }) as bigint;
    
    const formattedBalance = Number(currentBalance) / 10**decimals;
    
    console.log('\n=== APR FROM OBSERVED BALANCE ===');
    console.log('Initial deposit:', depositAmount, 'USDC');
    console.log('Current balance:', formattedBalance, 'aUSDC');
    console.log('Interest earned:', formattedBalance - depositAmount, 'USDC');
    
    // Calculate elapsed time
    const currentTime = Date.now();
    const daysElapsed = (currentTime - depositDateMiliseconds) / (1000 * 60 * 60 * 24);
    console.log('Days elapsed:', daysElapsed.toFixed(4));
    
    // Calculate observed APR using Artem's formula
    const returnRate = (formattedBalance - depositAmount) / depositAmount;
    const annualizedRate = returnRate * (365 / daysElapsed);
    const observedApr = annualizedRate * 100;
    
    console.log('Return rate:', returnRate);
    console.log('Annualized rate:', annualizedRate);
    console.log('Observed APR:', observedApr.toFixed(4) + '%');
    
    console.log('\n=== COMPARISON ===');
    console.log('Contract APR:', contractApr.toFixed(4) + '%');
    console.log('Observed APR:', observedApr.toFixed(4) + '%');
    console.log('Difference:', (observedApr - contractApr).toFixed(4) + '%');
    
    return {
      contractApr: contractApr.toFixed(4) + '%',
      observedApr: observedApr.toFixed(4) + '%',
      currentBalance: formattedBalance,
      daysElapsed: daysElapsed.toFixed(4),
      interestEarned: (formattedBalance - depositAmount),
      depositDateMiliseconds,
      depositAmount,
      poolAddress,
      userAddress
    };
    
  } catch (error) {
    console.error('Error calculating APR:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const marketAddress = args[0] as Address ?? config.contracts.poolAddress;
  const userAddress = args[1] as Address ?? '0x881E625E5C30973b47ceE3a0f3Ef456012F13f7D' // config.contracts.userAddress; 
  const initialDesposit = args[2] ?? '1' //10
  const depositDate = args[3] ?? 'Mar-21-2025 05:24:11 PM UTC' // 'Apr-14-2025 04:18:20 PM UTC';
  const result = await calculateApr(marketAddress, userAddress, +initialDesposit, depositDate)
  exportToTsv(result)
}

// Run if executed directly
if (import.meta.url === import.meta.resolve('./aaveApr.ts')) {
  main()
    .then(result => console.log('\nAPR calculation complete'))
    .catch(error => console.error('Calculation failed:', error));
}

export { calculateApr };