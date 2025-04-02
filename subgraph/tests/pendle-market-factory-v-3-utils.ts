import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  CreateNewMarket,
  Initialized,
  NewTreasuryAndFeeReserve,
  OwnershipTransferred,
  SetOverriddenFee
} from "../generated/PendleMarketFactoryV3/PendleMarketFactoryV3"

export function createCreateNewMarketEvent(
  market: Address,
  PT: Address,
  scalarRoot: BigInt,
  initialAnchor: BigInt,
  lnFeeRateRoot: BigInt
): CreateNewMarket {
  let createNewMarketEvent = changetype<CreateNewMarket>(newMockEvent())

  createNewMarketEvent.parameters = new Array()

  createNewMarketEvent.parameters.push(
    new ethereum.EventParam("market", ethereum.Value.fromAddress(market))
  )
  createNewMarketEvent.parameters.push(
    new ethereum.EventParam("PT", ethereum.Value.fromAddress(PT))
  )
  createNewMarketEvent.parameters.push(
    new ethereum.EventParam(
      "scalarRoot",
      ethereum.Value.fromSignedBigInt(scalarRoot)
    )
  )
  createNewMarketEvent.parameters.push(
    new ethereum.EventParam(
      "initialAnchor",
      ethereum.Value.fromSignedBigInt(initialAnchor)
    )
  )
  createNewMarketEvent.parameters.push(
    new ethereum.EventParam(
      "lnFeeRateRoot",
      ethereum.Value.fromUnsignedBigInt(lnFeeRateRoot)
    )
  )

  return createNewMarketEvent
}

export function createInitializedEvent(version: i32): Initialized {
  let initializedEvent = changetype<Initialized>(newMockEvent())

  initializedEvent.parameters = new Array()

  initializedEvent.parameters.push(
    new ethereum.EventParam(
      "version",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(version))
    )
  )

  return initializedEvent
}

export function createNewTreasuryAndFeeReserveEvent(
  treasury: Address,
  reserveFeePercent: i32
): NewTreasuryAndFeeReserve {
  let newTreasuryAndFeeReserveEvent =
    changetype<NewTreasuryAndFeeReserve>(newMockEvent())

  newTreasuryAndFeeReserveEvent.parameters = new Array()

  newTreasuryAndFeeReserveEvent.parameters.push(
    new ethereum.EventParam("treasury", ethereum.Value.fromAddress(treasury))
  )
  newTreasuryAndFeeReserveEvent.parameters.push(
    new ethereum.EventParam(
      "reserveFeePercent",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(reserveFeePercent))
    )
  )

  return newTreasuryAndFeeReserveEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createSetOverriddenFeeEvent(
  router: Address,
  market: Address,
  lnFeeRateRoot: BigInt
): SetOverriddenFee {
  let setOverriddenFeeEvent = changetype<SetOverriddenFee>(newMockEvent())

  setOverriddenFeeEvent.parameters = new Array()

  setOverriddenFeeEvent.parameters.push(
    new ethereum.EventParam("router", ethereum.Value.fromAddress(router))
  )
  setOverriddenFeeEvent.parameters.push(
    new ethereum.EventParam("market", ethereum.Value.fromAddress(market))
  )
  setOverriddenFeeEvent.parameters.push(
    new ethereum.EventParam(
      "lnFeeRateRoot",
      ethereum.Value.fromUnsignedBigInt(lnFeeRateRoot)
    )
  )

  return setOverriddenFeeEvent
}
