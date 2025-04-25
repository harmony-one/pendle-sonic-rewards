import { createPublicClient, http } from 'viem';
import { sonic } from 'viem/chains';

const config = {
  rpcUrl: sonic.rpcUrls.default.http[0],
  graphUrl: 'https://api.studio.thegraph.com/query/107620/pendle-sonic-rewards/version/latest',
  contracts: {
    gaugeController: '0xeE708FC793a02F1eDd5BB9DBD7fD13010D1F7136',
    pendleRouter: '0x888888888889758F76e7103c6CbF23ABbF58F946',
    PENDLE: '0xf1eF7d2D4C0c881cd634481e0586ed5d2871A74B'
  }
}


export default config