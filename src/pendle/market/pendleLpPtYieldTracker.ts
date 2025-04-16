// pendleLpPtYieldTracker.ts - Focused script for tracking PT yield component for liquidity providers
import { Address, formatEther, getAddress } from 'viem';
import { client } from '../../common/web3/client';
import { getLpPtYield } from './marketHelper';

// ABI snippets needed for the calculation
const PENDLE_MARKET_ABI = [
  // Read functions
  {
    inputs: [{ name: 'router', type: 'address' }],
    name: 'readState',
    outputs: [
      { name: 'totalPt', type: 'int256' },
      { name: 'totalSy', type: 'int256' },
      { name: 'totalLp', type: 'int256' },
      { name: 'treasury', type: 'address' },
      { name: 'scalarRoot', type: 'int256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'lnFeeRateRoot', type: 'uint256' },
      { name: 'reserveFeePercent', type: 'uint256' },
      { name: 'lastLnImpliedRate', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'lastLnImpliedRate', type: 'uint256' }
    ],
    name: 'UpdateImpliedRate',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'caller', type: 'address' },
      { indexed: true, name: 'receiver', type: 'address' },
      { indexed: false, name: 'netPtToAccount', type: 'int256' },
      { indexed: false, name: 'netSyToAccount', type: 'int256' },
      { indexed: false, name: 'netSyFee', type: 'uint256' },
      { indexed: false, name: 'netSyToReserve', type: 'uint256' }
    ],
    name: 'Swap',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: 'receiver', type: 'address' },
      { indexed: false, name: 'netLpOut', type: 'uint256' },
      { indexed: false, name: 'netSyUsed', type: 'uint256' },
      { indexed: false, name: 'netPtUsed', type: 'uint256' }
    ],
    name: 'Mint',
    type: 'event'
  }
];

/**
 * Calculate PT yield component for liquidity providers based on market composition and implied rate
 */
async function calculateLpPtYield(marketAddress: Address): Promise<number> {
  try {
    // 1. Get the market state
    const routerAddress = getAddress('0x888888888889758F76e7103c6CbF23ABbF58F946');
    const marketState = await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'readState',
      args: [routerAddress]
    }) as any;
    
    // 2. Extract key metrics
    const totalPt = Number(formatEther(BigInt(marketState.totalPt.toString())));
    const totalSy = Number(formatEther(BigInt(marketState.totalSy.toString())));
    const totalLp = Number(formatEther(await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: 'totalSupply'
    }) as bigint));
    
    const expiry = Number(marketState.expiry);
    const lastLnImpliedRate = Number(formatEther(BigInt(marketState.lastLnImpliedRate.toString())));
    
    console.log("Market state:", {
      totalPt,
      totalSy,
      totalLp,
      expiry,
      lastLnImpliedRate
    });
    
    // 3. Calculate time to maturity in years
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeToMaturitySeconds = expiry - currentTimestamp;
    const timeToMaturityYears = timeToMaturitySeconds / (365 * 24 * 60 * 60);
    
    // 4. Calculate the PT ratio in the LP position
    const ptRatio = totalPt / (totalPt + totalSy);
    console.log(`PT ratio in pool: ${ptRatio.toFixed(4)} (${(ptRatio * 100).toFixed(2)}%)`);
    
    // 5. Calculate the direct PT yield (if holding PT directly until maturity)
    const directPtYield = (Math.exp(lastLnImpliedRate) - 1) * 100;
    console.log(`Direct PT yield (from implied rate): ${directPtYield.toFixed(4)}%`);
    
    // 6. Calculate the PT exposure per LP token
    const ptPerLp = totalLp > 0 ? totalPt / totalLp : 0;
    console.log(`PT per LP token: ${ptPerLp.toFixed(6)}`);
    
    // 7. Account for impermanent loss adjustment
    // LP holders get less benefit from PT price appreciation due to impermanent loss
    // This is a simplified model of what actually happens in MarketMathCore
    const impermanentLossFactor = calculateImpermanentLossFactor(ptRatio, timeToMaturityYears);
    console.log(`Impermanent loss factor: ${impermanentLossFactor.toFixed(4)}`);
    
    // 8. Calculate the final LP PT yield component
    const lpPtYield = directPtYield * ptRatio * impermanentLossFactor;
    console.log(`LP PT yield component: ${lpPtYield.toFixed(4)}%`);
    
    return lpPtYield;
  } catch (error) {
    console.error("Error calculating LP PT yield:", error);
    return 0;
  }
}

/**
 * Calculate a simplified impermanent loss factor
 * This is an approximation of how impermanent loss affects PT yield for LPs
 */
function calculateImpermanentLossFactor(ptRatio: number, timeToMaturityYears: number): number {
  // For PT pools, impermanent loss increases as we get closer to maturity
  // This is a simplified model - the actual math is more complex in MarketMathCore
  const maturityProximityFactor = Math.min(1, 1 / (timeToMaturityYears + 0.1));
  
  // Impermanent loss is higher when the pool is unbalanced
  const balanceFactor = 4 * ptRatio * (1 - ptRatio); // Peaks at 1 when ptRatio = 0.5
  
  // This factor will be lower as we approach maturity and/or when the pool is unbalanced
  return Math.max(0.1, balanceFactor * (1 - 0.5 * maturityProximityFactor));
}

/**
 * Track PT yield changes over time by analyzing recent events
 */
async function trackRecentPtYieldChanges(marketAddress: Address): Promise<void> {
  try {
    const nowBlock = await client.getBlockNumber();
    const fromBlock = nowBlock - BigInt(10000); // Look back ~10,000 blocks
    
    // Get recent implied rate updates
    const rateEvents = await client.getLogs({
      address: marketAddress,
      event: {
        name: 'UpdateImpliedRate',
        inputs: [
          { type: 'uint256', name: 'timestamp', indexed: false },
          { type: 'uint256', name: 'lastLnImpliedRate', indexed: false }
        ],
        type: 'event'
      },
      fromBlock,
      toBlock: nowBlock
    }) as any;
    
    console.log(`Found ${rateEvents.length} rate update events`);
    
    if (rateEvents.length > 0) {
      // Display most recent rate updates
      // Inspect the actual structure of the event data
      console.log("Sample event structure:", JSON.stringify(rateEvents[0], null, 2));
      
      // More robust parsing of events
      const recentRates = rateEvents
        .slice(-5) // Get the most recent 5 events
        .map(event => {
          // Handle different possible structures of event data
          const args = event.args || {};
          const timestamp = Number(args.timestamp || event.data?.timestamp || 0);
          const lastLnImpliedRate = args.lastLnImpliedRate || event.data?.lastLnImpliedRate || '0';
          
          // Safe conversion
          const lnRate = Number(formatEther(BigInt(lastLnImpliedRate.toString())));
          const directPtYield = (Math.exp(lnRate) - 1) * 100;
          
          return {
            date: timestamp ? new Date(timestamp * 1000).toISOString() : 'Unknown',
            blockNumber: Number(event.blockNumber || 0),
            lnImpliedRate: lnRate,
            directPtYield: directPtYield.toFixed(4) + '%'
          };
        });
      
      console.log("Recent implied rate updates:");
      console.table(recentRates);
    }
    
    // Skip event processing if there are no events, but still calculate yield
    
    // Get the current PT yield for LPs
    const currentLpPtYield = await calculateLpPtYield(marketAddress);
    console.log(`\nCurrent LP PT yield component: ${currentLpPtYield.toFixed(4)}%`);
    
    return;
  } catch (error) {
    console.error("Error tracking PT yield changes:", error);
  }
}

/**
 * Main function to run the script
 */
async function main() {
  const args = process.argv.slice(2);
  const marketAddress = args[0] as Address;
  const ptRewards = await getLpPtYield(marketAddress)
  // missing Underlying yield + Pendle LP yield
  console.log('PT yield component:', {ptRewards});
  // if (!marketAddress) {
  //   console.error('Please provide a market address');
  //   process.exit(1);
  // }
  
  // console.log(`Analyzing PT yield component for LP providers in market ${marketAddress}...`);
  
  // Track yield changes
  // await trackRecentPtYieldChanges(marketAddress);
}

// Run the script
if (import.meta.url === import.meta.resolve('./pendleLpPtYieldTracker.ts')) {
  main().catch(console.error);
}

export { calculateLpPtYield, trackRecentPtYieldChanges };