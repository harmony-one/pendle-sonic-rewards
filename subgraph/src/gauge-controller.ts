import { MarketClaimReward, UpdateMarketReward } from '../generated/GaugeController/GaugeController'
import { MarketReward, RewardUpdate } from '../generated/schema'

export function handleMarketClaimReward(event: MarketClaimReward): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let marketReward = new MarketReward(id)
  
  marketReward.market = event.params.market
  marketReward.amount = event.params.amount
  marketReward.timestamp = event.block.timestamp
  marketReward.blockNumber = event.block.number
  
  marketReward.save()
}

export function handleUpdateMarketReward(event: UpdateMarketReward): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let rewardUpdate = new RewardUpdate(id)
  
  rewardUpdate.market = event.params.market
  rewardUpdate.pendlePerSec = event.params.pendlePerSec
  rewardUpdate.incentiveEndsAt = event.params.incentiveEndsAt
  rewardUpdate.timestamp = event.block.timestamp
  rewardUpdate.blockNumber = event.block.number
  
  rewardUpdate.save()
}