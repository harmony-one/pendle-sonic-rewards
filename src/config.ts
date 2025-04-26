import { sonic } from 'viem/chains';
import * as dotenv from 'dotenv'
import { Address } from 'viem';
dotenv.config()

const config = {
  rpcUrl: sonic.rpcUrls.default.http[0],
  graphUrl: 'https://api.studio.thegraph.com/query/107620/pendle-sonic-rewards/version/latest',
  contracts: {
    pendle: {
      market: '0x3F5EA53d1160177445B1898afbB16da111182418' as Address,
      gaugeController: '0xeE708FC793a02F1eDd5BB9DBD7fD13010D1F7136' as Address,
      pendleRouter: '0x888888888889758F76e7103c6CbF23ABbF58F946' as Address,
      PENDLE: '0xf1eF7d2D4C0c881cd634481e0586ed5d2871A74B' as Address,
    }, 
    equilibria: {
      pendleBooster: '0x920873E5b302A619C54c908aDFB77a1C4256A3B8' as Address
    }
  },
  userAddress: process.env.WALLET_ADDRESS as Address,
  privateKey : process.env.PRIVATE_KEY as Address
}


export default config