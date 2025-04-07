// subgraph/src/pendle-market.ts
import {
  RedeemReward as RedeemRewardEvent
} from "../generated/templates/PendleMarket/PendleMarket"
import { RedeemReward, RedeemRewardToken,  Market } from "../generated/schema"
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

export function handleRedeemReward(event: RedeemRewardEvent): void {  
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  let market = Market.load(event.address)
  if (market == null) {
    return
  }
  
  let entity = new RedeemReward(id);
  entity.user = event.params.user
  entity.market = market.id
  
  entity.blockTimestamp = event.block.timestamp;
  entity.blockNumber = event.block.number;
  entity.transactionHash = event.transaction.hash;
  entity.save();
  
  // Create individual reward entries
  for (let i = 0; i < event.params.rewardsOut.length; i++) {
    let rewardId = id.concat(Bytes.fromI32(i));
    let reward = new RedeemRewardToken(rewardId);
    reward.redeemEvent = id;
    
    // Simply store the index position as the token identifier
    // The client will resolve actual token addresses by querying the contract
    reward.token = Bytes.fromI32(i);
    
    reward.amount = event.params.rewardsOut[i];
    reward.save();
  }
}