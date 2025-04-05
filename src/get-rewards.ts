import { createPublicClient, http, Address, getAddress, parseUnits, formatUnits } from 'viem';
import { sonic } from 'viem/chains';
import config from './config';

// ABI Definitions
const PENDLE_MARKET_ABI = [
  {
    "inputs": [],
    "name": "SY",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PT",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "YT",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRewardTokens",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  }
];

const ERC20_ABI = [
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Type definitions
interface SubgraphReward {
  id: string;
  token: string;
  amount: string;
}

interface SubgraphMarket {
  id: string;
  address: string;
  principalToken: string;
  createdAt: string;
}

interface SubgraphRedeemEvent {
  id: string;
  user: string;
  blockTimestamp: string;
  transactionHash: string;
  market: SubgraphMarket;
  rewards: SubgraphReward[];
}

interface SubgraphResponse {
  data: {
    redeemRewards_collection: SubgraphRedeemEvent[];
  };
}

interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}

interface MarketInfo {
  address: Address;
  principalToken: TokenInfo;
  yieldToken: TokenInfo | null;
  standardizedYield: TokenInfo | null;
  rewardTokens: TokenInfo[];
  createdAt: Date;
}

interface RewardInfo {
  token: TokenInfo;
  amount: string;
  amountFormatted: string;
}

interface RedeemEventInfo {
  id: string;
  user: Address;
  timestamp: Date;
  transactionHash: string;
  market: MarketInfo;
  rewards: RewardInfo[];
}

// Create public client
const client = createPublicClient({
  chain: sonic,
  transport: http(config.rpcUrl)
});

// Subgraph endpoint
const SUBGRAPH_URL = config.graphUrl

// Cache for token and market information to reduce RPC calls
const tokenCache = new Map<string, TokenInfo>();
const marketCache = new Map<string, MarketInfo>();

/**
 * Fetches token information from the blockchain
 */
async function getTokenInfo(address: Address): Promise<TokenInfo> {
  // Check cache first
  const cacheKey = address.toLowerCase();
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!;
  }

  try {
    // Fetch token details from contract
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'name',
      }),
      client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      client.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    const tokenInfo: TokenInfo = {
      address,
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
    };

    // Cache the result
    tokenCache.set(cacheKey, tokenInfo);
    return tokenInfo;
  } catch (error) {
    console.error(`Failed to fetch token info for ${address}:`, error);
    
    // Return a placeholder on error
    const fallbackInfo: TokenInfo = {
      address,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: 18,
    };
    
    tokenCache.set(cacheKey, fallbackInfo);
    return fallbackInfo;
  }
}

/**
 * Fetches market information from the blockchain
 */
async function getMarketInfo(marketAddress: Address, principalTokenAddress: Address): Promise<MarketInfo> {
  // Check cache first
  const cacheKey = marketAddress.toLowerCase();
  if (marketCache.has(cacheKey)) {
    return marketCache.get(cacheKey)!;
  }

  try {
    // Fetch principal token info
    const principalToken = await getTokenInfo(principalTokenAddress);
    
    // Fetch additional market details from contract
    const [syAddress, ytAddress, rewardTokenAddresses] = await Promise.all([
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'SY',
      }).catch(() => null),
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'YT',
      }).catch(() => null),
      client.readContract({
        address: marketAddress,
        abi: PENDLE_MARKET_ABI,
        functionName: 'getRewardTokens',
      }).catch(() => [] as Address[]),
    ]);

    // Fetch SY token info if available
    const standardizedYield = syAddress 
      ? await getTokenInfo(syAddress as Address) 
      : null;

    // Fetch YT token info if available
    const yieldToken = ytAddress 
      ? await getTokenInfo(ytAddress as Address) 
      : null;

    // Fetch reward token info
    const rewardTokens: TokenInfo[] = [];
    for (const tokenAddress of (rewardTokenAddresses as Address[])) {
      const tokenInfo = await getTokenInfo(tokenAddress);
      rewardTokens.push(tokenInfo);
    }

    const marketInfo: MarketInfo = {
      address: marketAddress,
      principalToken,
      yieldToken,
      standardizedYield,
      rewardTokens,
      createdAt: new Date(), // This would ideally come from the subgraph
    };

    // Cache the result
    marketCache.set(cacheKey, marketInfo);
    return marketInfo;
  } catch (error) {
    console.error(`Failed to fetch market info for ${marketAddress}:`, error);
    
    // Return a basic market info with just the principal token on error
    const principalToken = await getTokenInfo(principalTokenAddress);
    const fallbackInfo: MarketInfo = {
      address: marketAddress,
      principalToken,
      yieldToken: null,
      standardizedYield: null,
      rewardTokens: [],
      createdAt: new Date(),
    };
    
    marketCache.set(cacheKey, fallbackInfo);
    return fallbackInfo;
  }
}

/**
 * Format token amount based on its decimals
 */
function formatTokenAmount(amount: string, decimals: number): string {
  return formatUnits(BigInt(amount), decimals);
}

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
    console.log(":::::Subgraph response:", JSON.stringify(result, null, 2));
    const redeemEvents = result.data.redeemRewards_collection;
    
    // Enrich the data with contract calls
    const enrichedEvents: RedeemEventInfo[] = [];
    
    for (const event of redeemEvents) {
      // Get market info with PT, YT, SY details
      const marketInfo = await getMarketInfo(
        getAddress(event.market.address),
        getAddress(event.market.principalToken)
      );
      
      // Enrich reward info
      const rewardTokenAddresses = marketInfo.rewardTokens.map(token => token.address);

      // Enrich reward info
      const enrichedRewards: RewardInfo[] = [];

      for (const reward of event.rewards) {
        // Parse the token index from the token field
        // Assuming token field now contains just the index
        const tokenIndex = parseInt(reward.token);
        
        // Get the actual token address using the index
        const tokenAddress = tokenIndex < rewardTokenAddresses.length 
          ? rewardTokenAddresses[tokenIndex] 
          : '0x0000000000000000000000000000000000000000';
        
        const tokenInfo = await getTokenInfo(getAddress(tokenAddress));
        const amountFormatted = formatTokenAmount(reward.amount, tokenInfo.decimals);
        
        enrichedRewards.push({
          token: tokenInfo,
          amount: reward.amount,
          amountFormatted,
        });
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
    console.log(`Principal Token: ${event.market.principalToken.symbol} (${event.market.principalToken.address})`);
    
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

// Export functions for external use
export {
  getUserRewardRedemptions,
  getTotalRewardsValue,
  getMarketInfo,
  getTokenInfo
};