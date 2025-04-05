import { createPublicClient, http, parseAbiItem, type Address } from 'viem';
import { sonic } from 'viem/chains';
import config from './config';

// Define the ABI for the RedeemRewards event
const redeemRewardsEventAbi = parseAbiItem(
  'event RedeemRewards(address user, uint256[] rewardsOut)'
);

const RPC_URL = config.rpcUrl

console.log(RPC_URL)
// Configure the Sonic client
const client = createPublicClient({
  chain: sonic,
  transport: http(RPC_URL), 
});

// List of Pendle market addresses to check
const marketAddresses: Address[] = [
  '0x3f5ea53d1160177445b1898afbb16da111182418'
  // Add more market addresses as needed
];

// Function to fetch RedeemRewards events
async function fetchRedeemRewardsEvents(address: Address) {
  try {
    console.log(`Checking for RedeemRewards events from market: ${address}`);
    
    const logs = await client.getLogs({
      address,
      event: redeemRewardsEventAbi,
      fromBlock: 'earliest',
      toBlock: 'latest'
    });
    
    console.log(`Found ${logs.length} RedeemRewards events`);
    
    if (logs.length > 0) {
      logs.forEach((log, index) => {
        console.log(`Event #${index + 1}:`);
        console.log({log})
        // console.log(`  User: ${log.args.user}`);
        // console.log(`  Rewards: ${log.args.rewardsOut}`);
        // console.log(`  Block: ${log.blockNumber}`);
        // console.log(`  Transaction: ${log.transactionHash}`);
      });
    }
    
    return logs;
  } catch (error) {
    console.error(`Error fetching events for ${address}:`, error);
    return [];
  }
}

// Main function to check all markets
async function checkAllMarkets() {
  console.log(`Checking ${marketAddresses.length} Pendle markets for RedeemRewards events...`);
  
  const results = await Promise.all(
    marketAddresses.map(address => fetchRedeemRewardsEvents(address))
  );
  
  const totalEvents = results.reduce((sum, events) => sum + events.length, 0);
  console.log(`Total RedeemRewards events found across all markets: ${totalEvents}`);
}

// Execute the script
checkAllMarkets().catch(console.error);