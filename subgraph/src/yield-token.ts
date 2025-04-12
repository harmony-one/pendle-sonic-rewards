// src/yield-token.ts
import {
  SwapYtAndSy as SwapYtAndSyEvent,
  SwapYtAndToken as SwapYtAndTokenEvent,
  YieldClaimed as YieldClaimedEvent,
  Transfer as TransferEvent
} from "../generated/templates/YieldToken/YieldToken"
import { 
  YTSwap, 
  YTYieldClaim,
  UserYTBalance,
  Market 
} from "../generated/schema"
import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts"

// Process YT swaps with SY
export function handleSwapYtAndSy(event: SwapYtAndSyEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  // Create swap entity
  let ytSwap = new YTSwap(id)
  ytSwap.ytToken = event.address
  ytSwap.caller = event.params.caller
  ytSwap.market = event.params.market
  ytSwap.receiver = event.params.receiver
  ytSwap.netYtToAccount = event.params.netYtToAccount
  ytSwap.netSyOrTokenToAccount = event.params.netSyToAccount
  ytSwap.isToken = false
  
  ytSwap.blockNumber = event.block.number
  ytSwap.blockTimestamp = event.block.timestamp
  ytSwap.transactionHash = event.transaction.hash
  
  ytSwap.save()
}

// Process YT swaps with tokens
export function handleSwapYtAndToken(event: SwapYtAndTokenEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  // Create swap entity
  let ytSwap = new YTSwap(id)
  ytSwap.ytToken = event.address
  ytSwap.caller = event.params.caller
  ytSwap.market = event.params.market
  ytSwap.receiver = event.params.receiver
  ytSwap.netYtToAccount = event.params.netYtToAccount
  ytSwap.netSyOrTokenToAccount = event.params.netTokenToAccount
  ytSwap.isToken = true
  ytSwap.tokenAddress = event.params.token
  ytSwap.netSyIntermediate = event.params.netSyInterm
  
  ytSwap.blockNumber = event.block.number
  ytSwap.blockTimestamp = event.block.timestamp
  ytSwap.transactionHash = event.transaction.hash
  
  ytSwap.save()
}

// Track yield claims on YT
export function handleYieldClaimed(event: YieldClaimedEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  let ytYieldClaim = new YTYieldClaim(id)
  ytYieldClaim.ytToken = event.address
  ytYieldClaim.user = event.params.user
  ytYieldClaim.amount = event.params.amount
  ytYieldClaim.blockNumber = event.block.number
  ytYieldClaim.blockTimestamp = event.block.timestamp
  ytYieldClaim.transactionHash = event.transaction.hash
  
  ytYieldClaim.save()
}

// Track YT transfers to update user balances
export function handleTransfer(event: TransferEvent): void {
  let txId = event.transaction.hash.concatI32(event.logIndex.toI32())
  
  // Create a user balance record for sender
  if (event.params.from.notEqual(Address.zero())) {
    // Create a unique ID for this user-token combination using transaction hash and a counter
    let fromBalanceId = txId.concatI32(1) // Adding a "1" suffix for sender
    
    // Check if the balance already exists by user-token
    let userTokenPairId = event.params.from.toHexString().concat('-').concat(event.address.toHexString())
    
    // Lookup existing balance or create new
    let fromBalance = UserYTBalance.load(Bytes.fromUTF8(userTokenPairId))
    if (!fromBalance) {
      fromBalance = new UserYTBalance(Bytes.fromUTF8(userTokenPairId))
      fromBalance.user = event.params.from
      fromBalance.ytToken = event.address
      fromBalance.balance = BigInt.zero()
    }
    
    // Decrease balance for sender
    fromBalance.balance = fromBalance.balance.minus(event.params.value)
    fromBalance.lastUpdated = event.block.timestamp
    fromBalance.save()
  }
  
  // Create a user balance record for receiver
  if (event.params.to.notEqual(Address.zero())) {
    // Create a unique ID for this user-token combination using transaction hash and a counter
    let toBalanceId = txId.concatI32(2) // Adding a "2" suffix for receiver
    
    // Check if the balance already exists by user-token
    let userTokenPairId = event.params.to.toHexString().concat('-').concat(event.address.toHexString())
    
    // Lookup existing balance or create new
    let toBalance = UserYTBalance.load(Bytes.fromUTF8(userTokenPairId))
    if (!toBalance) {
      toBalance = new UserYTBalance(Bytes.fromUTF8(userTokenPairId))
      toBalance.user = event.params.to
      toBalance.ytToken = event.address
      toBalance.balance = BigInt.zero()
    }
    
    // Increase balance for receiver
    toBalance.balance = toBalance.balance.plus(event.params.value)
    toBalance.lastUpdated = event.block.timestamp
    toBalance.save()
  }
}