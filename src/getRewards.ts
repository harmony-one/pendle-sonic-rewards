import { getAddress, formatUnits } from 'viem';
import config from './config';
import { RedeemEventInfo, RewardInfo, SubgraphResponse } from './types';
import { getMarketInfo, getTokenInfo } from './web3/helper';
import { formatTokenAmount } from './web3/numberUtils';


const SUBGRAPH_URL = config.graphUrl

/**
 * Fetches all reward redemptions for a user
 */
async function getUserRewardRedemptions(userAddress: string): Promise<RedeemEventInfo[]> {
  try {
    // Normalize the address
    const normalizedAddress = userAddress.toLowerCase();
    
    // Fetch data from subgraph
    const query = `
      query GetUserRewards($userAddress: Bytes!) {
        redeemRewards_collection(
          where: { user: $userAddress }
          orderBy: blockTimestamp
          orderDirection: desc
        ) {
          id
          user
          blockTimestamp
          transactionHash
          market {
            id
            address
            principalToken
            createdAt
          }
          rewards {
            id
            token
            amount
          }
        }
      }
    `;
    
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          userAddress: normalizedAddress,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: SubgraphResponse = await response.json();
    const redeemEvents = result.data.redeemRewards_collection;
    
    // Enrich the data with contract calls
    const enrichedEvents: RedeemEventInfo[] = [];
    
    for (const event of redeemEvents) {
      // Get market info with PT, YT, SY details
      const marketInfo = await getMarketInfo(
        getAddress(event.market.address),
        // getAddress(event.market.principalToken)
      );
      
      // Enrich reward info
      const rewardTokenAddresses = marketInfo.rewardTokens.map(token => token.address);
     
      // Enrich reward info
      const enrichedRewards: RewardInfo[] = [];

      for (const reward of event.rewards) {
        // Parse the token index from the token field
        // Assuming token field now contains just the index
        let tokenIndex = 0;
        if (reward.token.startsWith('0x')) {
          tokenIndex = parseInt(reward.token.slice(2, 4), 16);
        }
        
        // Get the actual token address using the index
        const tokenAddress = tokenIndex < rewardTokenAddresses.length 
          ? rewardTokenAddresses[tokenIndex] 
          : '0x0000000000000000000000000000000000000000';
        const tokenInfo = await getTokenInfo(getAddress(tokenAddress));
        if (tokenInfo) {
          const amountFormatted = formatTokenAmount(reward.amount, tokenInfo.decimals);
        
          enrichedRewards.push({
            token: tokenInfo,
            amount: reward.amount,
            amountFormatted,
          });
        }
      }
      
      enrichedEvents.push({
        id: event.id,
        user: getAddress(event.user),
        timestamp: new Date(parseInt(event.blockTimestamp) * 1000),
        transactionHash: event.transactionHash,
        market: {
          ...marketInfo,
          createdAt: new Date(parseInt(event.market.createdAt) * 1000),
        },
        rewards: enrichedRewards,
      });
    }
    
    return enrichedEvents;
  } catch (error) {
    console.error("Error fetching user rewards:", error);
    throw error;
  }
}

/**
 * Get total rewards value for a user
 */
async function getTotalRewardsValue(userAddress: string): Promise<Record<string, { total: string, symbol: string }>> {
  const redemptions = await getUserRewardRedemptions(userAddress);
  
  // Aggregate rewards by token
  const totals: Record<string, { amount: bigint, decimals: number, symbol: string }> = {};
  
  for (const redemption of redemptions) {
    for (const reward of redemption.rewards) {
      const tokenAddress = reward.token.address;
      
      if (!totals[tokenAddress]) {
        totals[tokenAddress] = { 
          amount: BigInt(0), 
          decimals: reward.token.decimals,
          symbol: reward.token.symbol 
        };
      }
      
      totals[tokenAddress].amount += BigInt(reward.amount);
    }
  }
  
  // Format totals
  const formattedTotals: Record<string, { total: string, symbol: string }> = {};
  
  for (const [address, data] of Object.entries(totals)) {
    formattedTotals[address] = {
      total: formatUnits(data.amount, data.decimals),
      symbol: data.symbol
    };
  }
  
  return formattedTotals;
}


/**
 * Main function to demonstrate usage
 */
async function main() {
  // Replace with the wallet address you want to check
  const walletAddress = '0x70709614BF9aD5bBAb18E2244046d48f234a1583';
  
  console.log(`Fetching reward redemptions for ${walletAddress}...`);
  const redemptions = await getUserRewardRedemptions(walletAddress);
  
  console.log(`Found ${redemptions.length} redemption events`);
  
  // Display detailed information
  for (const event of redemptions) {
    console.log('\n=== Redemption Event ===');
    console.log(`Transaction: ${event.transactionHash}`);
    console.log(`Date: ${event.timestamp.toLocaleString()}`);
    console.log('\nMarket Information:');
    console.log(`Market Address: ${event.market.address}`);
    event.market.principalToken && console.log(`Principal Token: ${event.market.principalToken.symbol} (${event.market.principalToken.address})`);
    
    if (event.market.yieldToken) {
      console.log(`Yield Token: ${event.market.yieldToken.symbol} (${event.market.yieldToken.address})`);
    }
    
    if (event.market.standardizedYield) {
      console.log(`Standardized Yield: ${event.market.standardizedYield.symbol} (${event.market.standardizedYield.address})`);
    }
    
    console.log('\nRewards:');
    for (const reward of event.rewards) {
      console.log(`${reward.amountFormatted} ${reward.token.symbol} (${reward.token.address})`);
    }
    console.log('========================\n');
  }
  
  // Show totals
  console.log('\n=== Total Rewards ===');
  const totals = await getTotalRewardsValue(walletAddress);
  
  for (const [address, data] of Object.entries(totals)) {
    console.log(`${data.total} ${data.symbol} (${address})`);
  }
}

// Run the script
main().catch(console.error);
