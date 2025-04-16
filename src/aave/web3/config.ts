import { Address, createPublicClient, http } from 'viem';
import { sonic } from 'viem/chains';

const config = {
  rpcUrl: sonic.rpcUrls.default.http[0],
  aavePoolUrl: 'https://app.aave.com/reserve-overview/?underlyingAsset=0x29219dd400f2bf60e5a23d13be72b486d4038894&marketName=proto_sonic_v3',
  graphUrl: 'https://api.studio.thegraph.com/query/107620/pendle-sonic-rewards/version/latest',
  contracts: {
    usdcAddress: '0x29219dd400f2bf60e5a23d13be72b486d4038894' as Address,
    aUsdcAddress: '0x578Ee1ca3a8E1b54554Da1Bf7C583506C4CD11c6' as Address,
    poolAddress: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3' as Address, // default
    userAddress: '0x70709614BF9aD5bBAb18E2244046d48f234a1583' as Address, // default
  }
}

export default config