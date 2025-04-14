// subgraph/src/pendle-market.ts
import {
  RedeemRewards as RedeemRewardsEvent,
  Transfer as TransferEvent
} from "../generated/templates/PendleMarket/PendleMarket"
import { UserLPPosition } from "../generated/schema"
import { RedeemRewards, RedeemRewardToken, Market } from "../generated/schema"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

export function handleRedeemRewards(event: RedeemRewardsEvent): void {  
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  let market = Market.load(event.address)
  if (market == null) {
    return
  }
  
  let entity = new RedeemRewards(id);
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

export function handleTransfer(event: TransferEvent): void {
  let from = event.params.from
  let to = event.params.to
  let amount = event.params.value
  
  // Update sender balance
  if (!from.equals(Address.zero())) {
    let fromPositionId = from.concat(event.address)
    let fromPosition = UserLPPosition.load(fromPositionId)
    
    if (fromPosition == null) {
      fromPosition = new UserLPPosition(fromPositionId)
      fromPosition.user = from
      fromPosition.market = event.address
      fromPosition.balance = BigInt.fromI32(0)
      fromPosition.activeBalance = BigInt.fromI32(0)
    }
    
    fromPosition.balance = fromPosition.balance.minus(amount)
    fromPosition.lastUpdated = event.block.timestamp
    fromPosition.save()
  }
  
  // Update receiver balance
  if (!to.equals(Address.zero())) {
    let toPositionId = to.concat(event.address)
    let toPosition = UserLPPosition.load(toPositionId)
    
    if (toPosition == null) {
      toPosition = new UserLPPosition(toPositionId)
      toPosition.user = to
      toPosition.market = event.address
      toPosition.balance = BigInt.fromI32(0)
      toPosition.activeBalance = BigInt.fromI32(0)
    }
    
    toPosition.balance = toPosition.balance.plus(amount)
    toPosition.lastUpdated = event.block.timestamp
    toPosition.save()
  }
}