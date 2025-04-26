import * as fs from 'fs';
import * as path from 'path';
import { ensureExportDirectory } from './helper';


/**
 * Formats a date for TSV output in the format DD/MM/YY HH:MM:SS
 */
function formatTsvDate(date: Date | number): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().substring(2);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Exports Equilibria APR data to a TSV file
 */
export async function exportToTsv(aprData: {
  // Protocol info
  name: string;                 // 'equilibria'
  marketAddress: string;        // Contract address of the market
  rewardPoolAddress: string;    // Address of the reward pool
  
  // Deposit info
  depositDate: Date;            // Date of deposit
  depositAsset: string;         // Symbol of deposit asset (e.g., LP token symbol)
  depositAmount: string;        // Amount of LP tokens deposited
  depositValueUSD: number;      // Value of deposit in USD
  
  // Reward info
  rewardAsset: string;          // Symbol of reward token (e.g., 'PENDLE')
  rewardAmount: string;         // Amount of rewards earned
  rewardValueUSD: number;       // Value of rewards in USD
  
  // Calculation data
  daysSinceDeposit: number;     // Days since deposit
  apr: number;                  // Calculated APR
  
  // User info
  userAddress: string;          // Address of the user
  
  // Links
  depositLink: string;          // Link to the deposit page
}) {
  try {
    console.log('Exporting Equilibria data to TSV...');
    const exportDir = ensureExportDirectory();
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = path.join(exportDir, `${timestamp}_equilibria_apr_${aprData.marketAddress.substring(0, 8)}_${aprData.userAddress.substring(0, 8)}.tsv`);
    
    // Calculate blocks (assuming average 2 second block time on Sonic)
    const blocksElapsed = Math.floor(aprData.daysSinceDeposit * 24 * 60 * 30); // ~2 seconds per block
    
    const tableHeaders = 'name\taddress\tdeposit_time\tdeposit_asset0\tdeposit_asset1\tdeposit_amount0\tdeposit_amount1\tdeposit_value0\tdeposit_value1\tdeposit_value\treward_asset0\treward_asset1\treward_amount0\treward_amount1\treward_value0\treward_value1\treward_value\ttotal_days\ttotal_blocks\tapr\ttype\tdeposit_link';
  
    // Create TSV row
    const row = [
      aprData.name,                               // name
      aprData.marketAddress,                      // address
      formatTsvDate(aprData.depositDate),         // deposit_time
      aprData.depositAsset,                       // deposit_asset0
      '',                                         // deposit_asset1
      aprData.depositAmount,                      // deposit_amount0
      '',                                         // deposit_amount1
      aprData.depositValueUSD.toString(),         // deposit_value0
      '',                                         // deposit_value1
      aprData.depositValueUSD.toString(),         // deposit_value
      aprData.rewardAsset,                        // reward_asset0
      '',                                         // reward_asset1
      aprData.rewardAmount,                       // reward_amount0
      '',                                         // reward_amount1
      aprData.rewardValueUSD.toFixed(8),          // reward_value0
      '',                                         // reward_value1
      aprData.rewardValueUSD.toFixed(8),          // reward_value
      aprData.daysSinceDeposit.toFixed(3),        // total_days
      blocksElapsed.toString(),                   // total_blocks
      aprData.apr.toFixed(5),                     // apr
      'Yield Farming',                            // type
      aprData.depositLink                         // deposit_link
    ].join('\t') + '\n';
    
    const tsvContent = [
      tableHeaders,
      row
    ].join('\n');

    // Write to TSV file
    fs.writeFileSync(filename, tsvContent);
      
    // Also print the row for verification
    console.log('\nExported TSV row:');
    console.log(row);
    
    return {
      filePath: filename,
      rowCount: 2  // Headers + 1 data row
    };
    
  } catch (error) {
    console.error('Error exporting TSV:', error);
    throw error;
  }
}