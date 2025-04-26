import { Address, parseAbi, formatUnits, parseAbiItem, BlockTag, getAddress } from 'viem';
import Decimal from 'decimal.js';
import config from '../config';
import { client } from '../common/web3/client';
import { calculateTokenAPR, findPoolId, getUserDepositInfo } from './equilibriaHelper';
import { getTokenInfo } from '../common/web3/helper';
import { exportToTsv } from '../common/exportToTsv';

// Contract addresses from your screenshots
const MARKET_LP = config.contracts.pendle.market;

const DEPOSIT_LINK = 'https://equilibria.fi/dashboard'

const baseRewardPoolABI = parseAbi([
  'function getRewardTokens() view returns (address[])',
  'function earned(address user, address rewardToken) view returns (uint256)',
]);

const erc20ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);


async function getUnclaimedRewards(rewardPoolAddress: Address, userAddress: Address) {
  // Get reward tokens
  const rewardTokens = await client.readContract({
    address: rewardPoolAddress,
    abi: baseRewardPoolABI,
    functionName: 'getRewardTokens',
  });

  console.log(`Found ${rewardTokens.length} reward tokens`);

  // Get earned amounts for each token
  const rewards = await Promise.all(
    rewardTokens.map(async (token) => {
      const earned = await client.readContract({
        address: rewardPoolAddress,
        abi: baseRewardPoolABI,
        functionName: 'earned',
        args: [userAddress, token],
      });

      const { symbol, decimals } = await getTokenInfo(token);
      const amount = new Decimal(earned.toString()).div(10 ** Number(decimals));

      return {
        token,
        symbol,
        decimals,
        amount,
        raw: earned,
      };
    })
  );

  return rewards;
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const marketAddress = args[0] as Address ?? MARKET_LP;
    const userAddress = args[1] as Address ?? config.userAddress;
    const depositAmount = args[2] ?? "10";
    const depositDate = args[3] ?? 'Apr-23-2025 05:24:46 PM UTC';
    const depositDateObj = new Date(depositDate);
    
    console.log(`Finding pool ID for Market LP: ${marketAddress}`);
    const { poolId, rewardPool } = await findPoolId(marketAddress);
    console.log(`Found pool ID: ${poolId} with reward pool: ${rewardPool}`);

    console.log(`\nGetting unclaimed rewards for user: ${userAddress}`);
    const rewards = await getUnclaimedRewards(rewardPool, userAddress);

    console.log('\nUnclaimed Rewards:');
    rewards.forEach((reward) => {
      console.log(`${reward.symbol}: ${reward.amount.toString()} (${reward.token})`);
    });

    const depositInfo = await getUserDepositInfo(userAddress, marketAddress);
    
    // Process the main reward (usually PENDLE)
    const mainReward = rewards[0]; // Assuming the first reward is PENDLE
    const aprResult = await calculateTokenAPR(
      mainReward.token, 
      mainReward.symbol, 
      mainReward.amount, 
      +depositAmount, 
      depositDateObj
    );
    
    console.log('APR result:', aprResult);
    
    // Prepare data for TSV export
    const exportData = {
      name: 'equilibria',
      marketAddress: marketAddress,
      rewardPoolAddress: rewardPool,
      depositDate: depositDateObj,
      depositAsset: depositInfo.depositToken.symbol || 'LP Token',
      depositAmount: depositAmount,
      depositValueUSD: +depositAmount, // Using the input deposit amount as USD value
      rewardAsset: mainReward.symbol,
      rewardAmount: mainReward.amount.toString(),
      rewardValueUSD: mainReward.amount.mul(aprResult.tokenPrice).toNumber(),
      daysSinceDeposit: aprResult.daysSinceDeposit,
      apr: aprResult.apr,
      userAddress: userAddress,
      depositLink: DEPOSIT_LINK
    };
    
    // Export to TSV
    await exportToTsv(exportData);
    
    console.log('\nEquilibria calculation complete');
  } catch (error) {
    console.error('Error:', error);
  }
}

if (import.meta.url === import.meta.resolve('./equilibriaApr.ts')) {
  main()
    .then(result => console.log('\nEquilibria calculation complete'))
    .catch(error => console.error('Calculation failed:', error));
}
