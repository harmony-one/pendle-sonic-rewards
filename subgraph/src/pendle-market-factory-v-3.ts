// subgraph/src/pendle-market-factory-v-3.ts
import {
  CreateNewMarket as CreateNewMarketEvent,
  Initialized as InitializedEvent,
  NewTreasuryAndFeeReserve as NewTreasuryAndFeeReserveEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  SetOverriddenFee as SetOverriddenFeeEvent
} from "../generated/PendleMarketFactoryV3/PendleMarketFactoryV3"
import { 
  PendleMarket as PendleMarketTemplate,
  YieldToken as YieldTokenTemplate
} from "../generated/templates"
import { PendleMarket } from "../generated/templates/PendleMarket/PendleMarket"
import {
  CreateNewMarket,
  Initialized,
  NewTreasuryAndFeeReserve,
  OwnershipTransferred,
  SetOverriddenFee,
  Market
} from "../generated/schema"
import { Address, log, Bytes } from "@graphprotocol/graph-ts"

export function handleCreateNewMarket(event: CreateNewMarketEvent): void {
  let entity = new CreateNewMarket(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.market = event.params.market
  entity.PT = event.params.PT
  entity.scalarRoot = event.params.scalarRoot
  entity.initialAnchor = event.params.initialAnchor
  entity.lnFeeRateRoot = event.params.lnFeeRateRoot

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Create market entity
  let market = new Market(event.params.market)
  market.address = event.params.market
  market.principalToken = event.params.PT
  market.createdAt = event.block.timestamp
  market.creationTx = event.transaction.hash
  
  // Start tracking market events
  PendleMarketTemplate.create(event.params.market)
  
  // Bind to the market contract to get its tokens
  let marketContract = PendleMarket.bind(event.params.market)
  
  // Try to get the YT token address
  let tokensCall = marketContract.try_readTokens()
  
  if (!tokensCall.reverted) {
    // We successfully got the tokens
    let syToken = tokensCall.value.get_SY()
    let ytToken = tokensCall.value.get_YT()
    
    // Store in the market entity
    market.standardizedYield = syToken
    market.yieldToken = ytToken
    
    log.info("Market {} created with YT token {}", [
      event.params.market.toHexString(),
      ytToken.toHexString()
    ])
    
    // Start tracking YT token events
    YieldTokenTemplate.create(ytToken)
  } else {
    log.warning("Could not read tokens for market {}", [
      event.params.market.toHexString()
    ])
  }
  
  market.save()
}

export function handleInitialized(event: InitializedEvent): void {
  let entity = new Initialized(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.version = event.params.version

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewTreasuryAndFeeReserve(
  event: NewTreasuryAndFeeReserveEvent
): void {
  let entity = new NewTreasuryAndFeeReserve(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.treasury = event.params.treasury
  entity.reserveFeePercent = event.params.reserveFeePercent

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let entity = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSetOverriddenFee(event: SetOverriddenFeeEvent): void {
  let entity = new SetOverriddenFee(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.router = event.params.router
  entity.market = event.params.market
  entity.lnFeeRateRoot = event.params.lnFeeRateRoot

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}