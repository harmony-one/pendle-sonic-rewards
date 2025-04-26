import { Address, PublicClient } from "viem";
import erc20Abi from './abis/erc20.json'
import { client } from "./client";
import { TokenInfo } from "../types";


// Cache for token and market information to reduce RPC calls
const tokenCache = new Map<string, TokenInfo>();

/**
 * Get token symbol
 */
export async function getTokenSymbol(client: PublicClient, tokenAddress: string): Promise<string> {
  try {
    const symbol = await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'symbol',
    }) as string;
    return symbol;
  } catch (error) {
    console.error(`Error getting symbol for ${tokenAddress}:`, error);
    return 'Unknown';
  }
}

/**
 * Fetches token information from the blockchain
 */
export async function getTokenInfo(address: Address): Promise<TokenInfo> {
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
        abi: erc20Abi,
        functionName: 'name',
      }).catch(() => 'UNKNOWN'),
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: 'symbol',
      }).catch(() => 'UNKNOWN'),
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: 'decimals',
      }).catch(() => 18),
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