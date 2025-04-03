import {
  RedeemRewards as RedeemRewardsEvent
} from "../generated/templates/PendleMarket/PendleMarket"
import { RedeemRewards, Market } from "../generated/schema"
import { BigInt } from "@graphprotocol/graph-ts";

export function handleRedeemRewards(event: RedeemRewardsEvent): void {  
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  let market = Market.load(event.address)
  if (market == null) {
    return
  }
  
  let entity = new RedeemRewards(id);
  entity.user = event.params.user
  entity.market = market.id
  let amounts: BigInt[] = [];
  for (let i = 0; i < event.params.rewardsOut.length; i++) {
    amounts.push(event.params.rewardsOut[i]);
  }
  entity.amounts = amounts;
  
  entity.blockTimestamp = event.block.timestamp;
  entity.blockNumber = event.block.number;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

// export function handleRedeemRewards(event: RedeemRewardsEvent): void {
//   let id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  
//   let marketAddress = event.address.toHexString();
//   let market = Market.load(marketAddress);
//   if (market == null) {
//     // Create the market if it doesn't exist yet
//     market = new Market(marketAddress);
//     market.address = event.address;
//     market.principalToken = Bytes.fromHexString("0x0000000000000000000000000000000000000000"); // Update if you have access to PT
//     market.createdAt = event.block.timestamp;
//     market.creationTx = event.transaction.hash;
//     market.save();
//   }
  
//   let entity = new RewardClaim(id);
//   entity.user = event.params.user;
//   entity.market = market.id;
  
//   // Convert rewardsOut to string array to store in GraphQL
//   let amounts: BigInt[] = [];
//   for (let i = 0; i < event.params.rewardsOut.length; i++) {
//     amounts.push(event.params.rewardsOut[i]);
//   }
//   entity.amounts = amounts;
  
//   entity.blockTimestamp = event.block.timestamp;
//   entity.blockNumber = event.block.number;
//   entity.transactionHash = event.transaction.hash;
//   entity.save();
// }