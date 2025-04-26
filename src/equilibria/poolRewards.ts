import { Address, parseAbi, formatUnits, parseAbiItem, BlockTag } from 'viem';
import config from '../config';
import { client } from '../common/web3/client';
import { findPoolId } from './equilibriaHelper';

// Contract addresses from your screenshots
const MARKET_LP = config.contracts.pendle.market;


const erc20ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);


const getRewardsFromPool = async (
  rewardPool: Address,
  startBlock: bigint | BlockTag | undefined = BigInt(1000000),
  endBlock: bigint | BlockTag | undefined = 'latest'
) => { 
  
  const rewardAddedEvents = await client.getLogs({
    address: rewardPool,
    event: parseAbiItem(['event RewardAdded(address indexed token, uint256 amount)']),
    fromBlock: startBlock,
    toBlock: endBlock
  }) as any;
  
  // Process events chronologically with proper type safety
  for (const event of rewardAddedEvents) {
    if (event.args) {
      const rewardToken = event.args.token as Address;
      const amount = event.args.amount as bigint;
      const block = await client.getBlock({
        blockNumber: event.blockNumber
      });
      const timestamp = new Date(Number(block.timestamp) * 1000);
      // Get token decimals first
      const tokenDecimals = await client.readContract({
        address: rewardToken,
        abi: erc20ABI,
        functionName: 'decimals',
      });

      const txDetails = await client.getTransaction({
        hash: event.transactionHash
      });

      console.log(`Transaction sender: ${txDetails.from}`);
      console.log(`${timestamp}: Added ${formatUnits(amount, tokenDecimals)} of ${rewardToken}`);
    }
  }
}

// to get the reward transactions. Looking for unclaimed
const getRewardsClaimedFromUser = async (
  rewardPool: Address,
  userAddress: Address,
  startBlock: bigint | BlockTag | undefined = BigInt(1000000),
  endBlock: bigint | BlockTag | undefined = 'latest'
) => { 
  
  const rewardPaidEvents = await client.getLogs({
    address: rewardPool,
    event:  parseAbiItem(['event RewardPaid(address indexed user, address indexed token, uint256 amount)']),
    args: {
      user: userAddress 
    },
    fromBlock: startBlock,
    toBlock: endBlock
  }) as any;
  console.log(rewardPaidEvents)
  // Process events chronologically with proper type safety
  for (const event of rewardPaidEvents) {
    if (event.args) {
      console.log(event.args)
    }
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const marketAddress = args[0] as Address ?? MARKET_LP;

    console.log(`Finding pool ID for Market LP: ${marketAddress}`);
    const { poolId, rewardPool } = await findPoolId(marketAddress);
    console.log(`Found pool ID: ${poolId} with reward pool: ${rewardPool}`);


  await getRewardsFromPool(rewardPool, 20841004n, 'latest') 
   

  } catch (error) {
    console.error('Error:', error);
  }
}

if (import.meta.url === import.meta.resolve('./poolRewards.ts')) {
  main()
    .then(result => console.log('\nEquilibria calculation complete'))
    .catch(error => console.error('Calculation failed:', error));
}
