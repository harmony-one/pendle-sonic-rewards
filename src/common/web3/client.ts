import { createPublicClient, http } from "viem";
import { sonic } from "viem/chains";

export const SONIC_RPC_URL = sonic.rpcUrls.default.http[0]

export const client = createPublicClient({
  chain: sonic,
  transport: http(SONIC_RPC_URL)
});
