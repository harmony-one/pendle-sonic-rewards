import Decimal from "decimal.js";
import { Address, formatUnits, getAddress, parseAbi, parseAbiItem } from "viem";
import coinGeckoService from "../common/api/coinGecko";
import { client } from "../common/web3/client";
import config from "../config";
import { getTokenInfo } from "../common/web3/helper";

const PENDLE_BOOSTER = config.contracts.equilibria.pendleBooster;
const pendleBoosterABI = parseAbi([
  'function poolLength() view returns (uint256)',
  'function poolInfo(uint256) view returns (address lpToken, address token, address rewardPool, bool shutdown)',
]);

export async function findPoolId(marketAddress: Address): Promise<{ poolId: number; token: Address; rewardPool: Address }> {
  // Get pool length
  const poolLength = await client.readContract({
    address: PENDLE_BOOSTER,
    abi: pendleBoosterABI,
    functionName: 'poolLength',
  });

  // Iterate through pools to find the one matching our Market LP
  for (let i = 0; i < Number(poolLength); i++) {
    const poolInfo = await client.readContract({
      address: PENDLE_BOOSTER,
      abi: pendleBoosterABI,
      functionName: 'poolInfo',
      args: [BigInt(i)],
    });
    if (poolInfo[0].toLowerCase() === marketAddress.toLowerCase()) {
      return {
        poolId: i,
        token: poolInfo[1],
        rewardPool: poolInfo[2]
      };
    }
  }

  throw new Error(`Pool not found for Market LP: ${marketAddress}`);
}

export async function getUserDepositInfo(userAddress: Address, marketAddress: Address) {
  try {
    // Normalize addresses
    userAddress = getAddress(userAddress);
    marketAddress = getAddress(marketAddress);
    
    console.log(`Finding pool ID for Market: ${marketAddress}`);
    const { poolId, token, rewardPool } = await findPoolId(marketAddress);
    console.log(`Found pool ID: ${poolId} with deposit token: ${token} and reward pool: ${rewardPool}`);
    
    // Get token info with error handling
    const tokenInfo = await getTokenInfo(token).catch(() => ({ symbol: 'UNKNOWN', decimals: 18 }));
    const marketInfo = await getTokenInfo(marketAddress).catch(() => ({ symbol: 'UNKNOWN', decimals: 18 }));
    
    // Get deposit events
    const depositEvents = await client.getLogs({
      address: PENDLE_BOOSTER,
      event: parseAbiItem('event Deposited(address indexed user, uint256 indexed pid, uint256 amount)'),
      args: {
        user: userAddress,
        pid: BigInt(poolId)
      },
      fromBlock: BigInt(1),
      toBlock: 'latest'
    });
    
    // Process and calculate deposits and withdrawals
    let totalDeposited = BigInt(0);

    // Process deposit history with related transfers
    const depositHistory = await Promise.all(depositEvents.map(async (event) => {
      const amount = event.args!.amount as bigint;
      totalDeposited += amount;
      
      const block = await client.getBlock({ blockNumber: event.blockNumber });
      const timestamp = new Date(Number(block.timestamp) * 1000);
      const txHash = event.transactionHash;
      
      // Get detailed transaction data including all token transfers
      const txReceipt = await client.getTransactionReceipt({ hash: txHash });
      
      // Extract token transfers related to the transaction
      const transfers: any[] = [];
      
      // Search for transfer events in the transaction logs
      for (const log of txReceipt.logs) {
        try {
          if (log && log.topics.length >= 3) {
            const from = `0x${log.topics[1]?.slice(26)}`;
            const to = `0x${log.topics[2]?.slice(26)}`;
            const valueHex = log.data.startsWith('0x') ? log.data : `0x${log.data}`;
            const value = BigInt(valueHex);
            
            // Get token info
            const tokenAddress = log.address;
            const tokenDetails = await getTokenInfo(tokenAddress);
            tokenDetails && transfers.push({
              token: tokenAddress,
              from,
              to,
              value: formatUnits(value, tokenDetails.decimals),
              symbol: tokenDetails.symbol,
              valueRaw: value
            });
          }
        } catch (error) {
          console.warn(`Error parsing transfer log: ${error}`);
        }
      }
      
      return {
        type: 'deposit',
        amount: tokenInfo ? formatUnits(amount, tokenInfo.decimals) : 0,
        timestamp,
        txHash,
        blockNumber: event.blockNumber,
        transfers
      };
    }));
  
    const transactionHistory = [...depositHistory].sort((a, b) => 
      Number(a.blockNumber) > Number(b.blockNumber) ? 1 : -1
    );
    const timestamp = new Date(Number(transactionHistory[0].timestamp) * 1000);
    return {
      user: userAddress,
      market: {
        address: marketAddress,
        symbol: marketInfo ? marketInfo.symbol : ''
      },
      poolId,
      depositToken: {
        address: token,
        symbol: tokenInfo ? tokenInfo.symbol : ''
      },
      depositTimestamp: timestamp,
      totalDeposited: tokenInfo ? formatUnits(totalDeposited, tokenInfo.decimals) : 0,
      transactionHistory,
      depositEvents: depositEvents.length,
    };
  } catch (error) {
    console.error('Error getting deposit info:', error);
    throw error;
  }
}

export async function calculateTokenAPR(
  rewardToken: Address,
  rewardSymbol: string,
  rewardAmount: Decimal,
  depositUSD: number,
  depositDate: Date
): Promise<any> {
  try {
    // Get current date for calculation
    const now = new Date();
    
    // Round down days since deposit (minimum 1 day to avoid division by zero)
    const daysSinceDeposit = Math.max(1, Math.floor((now.getTime() - depositDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Get token price based on the symbol or address
    let tokenPrice = 0;
    
    // Try to get token ID from address first
    const tokenId = coinGeckoService.getCoinGeckoIdFromAddress(rewardToken);
    
    if (tokenId) {
      // If we have a mapping for this token, use it
      tokenPrice = await coinGeckoService.getTokenPrice(tokenId).catch(() => 0);
    } else if (rewardSymbol.toLowerCase().includes('pendle')) {
      // Fallback for PENDLE tokens
      tokenPrice = await coinGeckoService.getPendlePrice().catch(() => 3.37);
    } else {
      // For other tokens without mapping, we'd need to add logic here
      console.warn(`No price data available for ${rewardSymbol}, using default price of 1.0`);
      tokenPrice = 1.0;
    }
    
    // Calculate reward value in USD
    const rewardValueUSD = rewardAmount.mul(tokenPrice);
    
    // Calculate APR: (reward value / deposit value) * 365 / days * 100
    const apr = rewardValueUSD.div(depositUSD).mul(365).div(daysSinceDeposit).mul(100);
    console.log(rewardValueUSD, depositUSD, daysSinceDeposit)
    console.log(`APR Calculation for ${rewardSymbol}:`);
    console.log(`- Reward amount: ${rewardAmount} ${rewardSymbol}`);
    console.log(`- Token price: $${tokenPrice}`);
    console.log(`- Reward value: $${rewardValueUSD}`);
    console.log(`- Deposit value: $${depositUSD}`);
    console.log(`- Days since deposit: ${daysSinceDeposit.toFixed(2)}`);
    console.log(`- Calculated APR: ${apr.toNumber().toFixed(2)}%`);
    
    return {
      tokenPrice,
      apr: apr.toNumber(),
      daysSinceDeposit
    }
  } catch (error) {
    console.error(`Error calculating APR for ${rewardSymbol}:`, error);
    return 0;
  }
}