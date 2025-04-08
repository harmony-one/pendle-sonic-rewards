import { formatUnits } from "viem";

/**
 * Format token amount based on its decimals
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  return formatUnits(BigInt(amount), decimals);
}
