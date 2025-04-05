import { createPublicClient, http } from "viem";
import { sonic } from "viem/chains";
import config from "../config";

export const client = createPublicClient({
  chain: sonic,
  transport: http(config.rpcUrl)
});
