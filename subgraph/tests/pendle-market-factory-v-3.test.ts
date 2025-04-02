import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { CreateNewMarket } from "../generated/schema"
import { CreateNewMarket as CreateNewMarketEvent } from "../generated/PendleMarketFactoryV3/PendleMarketFactoryV3"
import { handleCreateNewMarket } from "../src/pendle-market-factory-v-3"
import { createCreateNewMarketEvent } from "./pendle-market-factory-v-3-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let market = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let PT = Address.fromString("0x0000000000000000000000000000000000000001")
    let scalarRoot = BigInt.fromI32(234)
    let initialAnchor = BigInt.fromI32(234)
    let lnFeeRateRoot = BigInt.fromI32(234)
    let newCreateNewMarketEvent = createCreateNewMarketEvent(
      market,
      PT,
      scalarRoot,
      initialAnchor,
      lnFeeRateRoot
    )
    handleCreateNewMarket(newCreateNewMarketEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("CreateNewMarket created and stored", () => {
    assert.entityCount("CreateNewMarket", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "CreateNewMarket",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "market",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "CreateNewMarket",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "PT",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "CreateNewMarket",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "scalarRoot",
      "234"
    )
    assert.fieldEquals(
      "CreateNewMarket",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "initialAnchor",
      "234"
    )
    assert.fieldEquals(
      "CreateNewMarket",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "lnFeeRateRoot",
      "234"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
