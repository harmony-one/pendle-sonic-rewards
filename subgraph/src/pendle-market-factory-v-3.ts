import {
  CreateNewMarket as CreateNewMarketEvent,
  Initialized as InitializedEvent,
  NewTreasuryAndFeeReserve as NewTreasuryAndFeeReserveEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  SetOverriddenFee as SetOverriddenFeeEvent
} from "../generated/PendleMarketFactoryV3/PendleMarketFactoryV3"
import {
  CreateNewMarket,
  Initialized,
  NewTreasuryAndFeeReserve,
  OwnershipTransferred,
  SetOverriddenFee
} from "../generated/schema"

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
