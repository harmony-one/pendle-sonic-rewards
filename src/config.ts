import { createPublicClient, http } from 'viem';
import { sonic } from 'viem/chains';

const config = {
  rpcUrl: sonic.rpcUrls.default.http[0],
  graphUrl: 'https://api.studio.thegraph.com/query/107620/pendle-sonic-rewards/version/latest'
}


export default config