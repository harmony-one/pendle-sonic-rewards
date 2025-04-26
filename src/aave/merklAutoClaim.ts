// src/aave/merklAutoClaim.ts
import { Address, parseAbi } from 'viem';
import { MerklApi } from '@merkl/api';
import { client } from '../common/web3/client';
import coinGeckoService from '../common/api/coinGecko';
import config from '../config';
// Initialize Merkl API
const api = MerklApi('https://api.merkl.xyz').v4;

// Merkl Distributor address on Sonic chain
const MERKL_DISTRIBUTOR_ADDRESS = '0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae' as Address;

// Minimal ABI for the Distributor contract
const MERKL_DISTRIBUTOR_ABI = parseAbi([
  'function getMerkleRoot() public view returns (bytes32)',
  'function claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs) external',
  'function claimed(address user, address token) external view returns (uint208 amount, uint48 timestamp, bytes32 merkleRoot)'
]);

/**
 * Check for claimable rewards and claim them if available
 * @param userAddress User wallet address
 * @param privateKey Private key for signing transactions (handle securely!)
 */
export async function checkAndClaimRewards(userAddress: Address, privateKey: `0x${string}`) {
  try {
    console.log(`===== Merkl Auto-Claim: ${new Date().toISOString()} =====`);
    console.log(`Checking for claimable rewards for ${userAddress}...`);
    
    // Step 1: Check for claimable rewards using the API
    const rewards = await checkClaimableRewards(userAddress);
    
    if (!rewards.hasClaimableRewards) {
      console.log('No claimable rewards available at this time.');
      console.log('Next check will be in 24 hours.');
      return;
    }
    
    // Step 2: Claim rewards if available
    console.log(`Found claimable rewards! Proceeding to claim...`);
    const claimResult: any = await claimRewards(userAddress, privateKey);
    
    // Step 3: Log the result
    if (claimResult.success) {
      console.log(`Successfully claimed rewards! Transaction: ${claimResult.transactionHash}`);
    } else {
      console.log(`Failed to claim rewards: ${claimResult.message}`);
    }
    
  } catch (error) {
    console.error('Auto-claim process failed:', error);
  }
}

/**
 * Check if a user has claimable rewards
 */
async function checkClaimableRewards(userAddress: Address) {
  try {
    // Get rewards data from Merkl API
    const response: any = await api.users({ address: userAddress }).rewards.get({ 
      query: { chainId: [146], claimableOnly: false } // Sonic chain
    });
    response.data && console.log('fco:::::::', response.data[0].rewards[0])
    if (!response.data || response.data.length === 0) {
      return { hasClaimableRewards: false };
    }
    
    // Process rewards data
    const sonicRewards = response.data[0]; // Rewards for Sonic chain
    let hasClaimableRewards = false;
    let totalClaimable = 0;
    let claimableTokens: any[]= [];
    
    // Check if any rewards have pending amounts
    for (const reward of sonicRewards.rewards || []) {
      if (reward.pending && BigInt(reward.pending) > 0n) {
        hasClaimableRewards = true;
        totalClaimable += Number(reward.pending) / (10 ** reward.token.decimals);
        claimableTokens.push({
          symbol: reward.token.symbol,
          amount: Number(reward.pending) / (10 ** reward.token.decimals)
        });
      }
    }
    
    if (hasClaimableRewards) {
      console.log(`Found ${claimableTokens.length} tokens with claimable rewards:`);
      claimableTokens.forEach(token => {
        console.log(`- ${token.amount} ${token.symbol}`);
      });
    }
    
    return {
      hasClaimableRewards,
      totalClaimable,
      claimableTokens,
      rawData: sonicRewards
    };
  } catch (error) {
    console.error('Error checking claimable rewards:', error);
    return { hasClaimableRewards: false };
  }
}

/**
 * Claim available rewards
 */
async function claimRewards(userAddress: Address, privateKey: `0x${string}`) {
  try {
    // Step 1: Get user rewards from the API
    const rewardsResponse = await api.users({ address: userAddress }).rewards.get({ 
      query: { chainId: [146] } // Sonic chain ID
    });
    
    if (!rewardsResponse.data || rewardsResponse.data.length === 0) {
      return { success: false, message: 'No rewards data found' };
    }
    
    // Step 2: Extract the necessary data for claiming
    const sonicRewards = rewardsResponse.data[0]; // Rewards for Sonic chain
    
    // Check if there are any pending/claimable rewards
    const claimableRewards = sonicRewards.rewards.filter(
      reward => reward.pending && BigInt(reward.pending) > 0n
    );
    
    if (claimableRewards.length === 0) {
      return { success: false, message: 'No claimable rewards found' };
    }
    
    // Step 3: Prepare claim parameters
    // This is tricky without the 'generate' endpoint
    // We need to construct users, tokens, amounts, and proofs arrays
    
    // For users, we just repeat the user address for each token
    const users = claimableRewards.map(() => userAddress);
    
    // For tokens, we extract the token addresses
    const tokens = claimableRewards.map(reward => reward.token.address as Address);
    
    // For amounts, we use the total (claimed + pending) amounts
    const amounts = claimableRewards.map(reward => BigInt(reward.amount));
    
    // For proofs, we need to extract from the breakdowns
    // This is the challenging part without the proper endpoint
    // We would need to construct Merkle proofs manually or find another endpoint
    
    // Since we don't have a direct way to get proofs from the available endpoints,
    // we need to either:
    // 1. Find another API endpoint that provides them
    // 2. Calculate them manually using the Merkle tree data
    // 3. Use the UI network requests to identify how it gets proofs
    
    console.log("Warning: Without a claims/generate endpoint, we cannot get the required Merkle proofs.");
    console.log("Manual intervention required: Please use the Merkl UI to claim rewards.");
    
    return { 
      success: false, 
      message: 'Cannot generate Merkle proofs with available API endpoints',
      claimableRewards
    };
    
    /* 
    // If we had proofs, the rest would work like this:
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: sonic,
      transport: http('https://rpc.sonic.fantom.network')
    });
    
    const hash = await walletClient.writeContract({
      address: MERKL_DISTRIBUTOR_ADDRESS,
      abi: MERKL_DISTRIBUTOR_ABI,
      functionName: 'claim',
      args: [users, tokens, amounts, proofs]
    });
    
    console.log(`Claim transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return {
      success: receipt.status === 'success',
      transactionHash: hash,
      receipt
    };
    */
    
  } catch (error) {
    console.error('Error claiming rewards:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Check how much has already been claimed for a specific token
 */
export async function getClaimedAmount(userAddress: Address, tokenAddress: Address) {
  try {
    const claimInfo = await client.readContract({
      address: MERKL_DISTRIBUTOR_ADDRESS,
      abi: MERKL_DISTRIBUTOR_ABI,
      functionName: 'claimed',
      args: [userAddress, tokenAddress]
    });
    
    return {
      amount: claimInfo[0],
      timestamp: new Date(Number(claimInfo[1]) * 1000),
      merkleRoot: claimInfo[2]
    };
  } catch (error) {
    console.error('Error getting claimed amount:', error);
    return null;
  }
}

/**
 * Schedule daily checks for rewards
 */
export async function scheduleAutoClaim(userAddress: Address, privateKey: `0x${string}`) {
  // Do an initial check immediately
  await checkAndClaimRewards(userAddress, privateKey);
  
  // Schedule daily checks (24 hours in milliseconds)
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  console.log(`\nAuto-claim script is now running.`);
  console.log(`Will check for claimable rewards every 24 hours.`);
  
  setInterval(async () => {
    await checkAndClaimRewards(userAddress, privateKey);
  }, ONE_DAY_MS);
}

// Run the auto-claim script if executed directly
if (import.meta.url === import.meta.resolve('./merklAutoClaim.ts')) {
  const pendlePrice = await coinGeckoService.getPendlePrice()
  console.log('PENDLE PRICE', pendlePrice)
  // Replace with your wallet address and private key (use environment variables in production!)
  const userAddress = config.userAddress; 
  const privateKey = config.privateKey;
  console.log(privateKey)
  if (!userAddress || !privateKey) {
    console.error('Please set WALLET_ADDRESS and PRIVATE_KEY environment variables');
    process.exit(1);
  }
  
  scheduleAutoClaim(userAddress, privateKey).catch(console.error);
}