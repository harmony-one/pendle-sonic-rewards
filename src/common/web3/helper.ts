import { Address, PublicClient } from "viem";
import erc20Abi from './abis/erc20.json'
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