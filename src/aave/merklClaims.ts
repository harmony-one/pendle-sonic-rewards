// src/merkl/merklContract.ts
import { Address, createPublicClient, http, parseAbi, createWalletClient } from 'viem';
import { sonic } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { MerklApi } from '@merkl/api';
import { MerklCampaign } from './types';
import { client } from '../common/web3/client';

// The address we want to verify
const MERKL_DISTRIBUTOR_ADDRESS = '0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae' as Address;

// Minimal ABI with just the functions we need to verify
const MERKL_DISTRIBUTOR_ABI = parseAbi([
  'function getMerkleRoot() public view returns (bytes32)',
  'function claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs) external'
]);
const api = MerklApi('https://api.merkl.xyz').v4;


// Sonic chain client
const publicClient = createPublicClient({
  chain: sonic,
  transport: http('https://rpc.sonic.fantom.network')
});

// ======== CONTRACT INTERACTION FUNCTIONS =========

/**
 * Claims rewards from the Merkl distributor contract directly
 * @param privateKey Private key for transaction signing
 * @param users Array of user addresses eligible for rewards
 * @param tokens Array of token addresses to be claimed
 * @param amounts Array of token amounts to claim
 * @param proofs Array of Merkle proofs
 * @returns Transaction hash
 */
export async function claimMerklRewards(
  privateKey: `0x${string}`,
  users: Address[],
  tokens: Address[],
  amounts: bigint[],
  proofs: `0x${string}`[][]
) {
  try {
    console.log('Claiming Merkl rewards directly via contract...');
    
    // Create wallet client from private key
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: sonic,
      transport: http('https://rpc.sonic.fantom.network')
    });
    
    // Log claim parameters
    console.log(`Claiming for users: ${users.join(', ')}`);
    console.log(`Token addresses: ${tokens.join(', ')}`);
    console.log(`Amounts: ${amounts.map(a => a.toString()).join(', ')}`);
    
    // Execute claim transaction
    const hash = await walletClient.writeContract({
      address: MERKL_DISTRIBUTOR_ADDRESS,
      abi: MERKL_DISTRIBUTOR_ABI,
      functionName: 'claim',
      args: [users, tokens, amounts, proofs]
    });
    
    console.log(`Claim transaction submitted: ${hash}`);
    
    // Wait for transaction to be mined
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return {
      success: receipt.status === 'success',
      transactionHash: hash,
      receipt
    };
  } catch (error) {
    console.error('Error claiming Merkl rewards:', error);
    throw error;
  }
}

// ======== INTEGRATION WITH YOUR MERKL API WRAPPER =========

/**
 * Complete flow to fetch user rewards and claim them
 * @param userAddress User wallet address
 * @param privateKey Private key for transaction signing
 */
export async function fetchAndClaimMerklRewards(
  userAddress: Address,
  privateKey: `0x${string}`
) {
  try {
    console.log(`Starting Merkl rewards claim process for ${userAddress}...`);
    
    // Step 1: Use your existing API to fetch user rewards
    const userRewardsResponse = await api.users({ address: userAddress }).rewards.get({ 
      query: { chainId: [146] } // Sonic chain ID
    });
    
    if (!userRewardsResponse.data || userRewardsResponse.data.length === 0) {
      console.log('No rewards data found for user');
      return { success: false, message: 'No rewards data found' };
    }
    
    // Step 2: Check if there are claimable rewards
    let hasClaimableRewards = false;
    const sonicRewards = userRewardsResponse.data[0]; // Rewards for Sonic chain
    
    // Check if any rewards have pending amounts
    for (const reward of sonicRewards.rewards || []) {
      if (reward.pending && BigInt(reward.pending) > 0n) {
        hasClaimableRewards = true;
        break;
      }
    }
    
    if (!hasClaimableRewards) {
      console.log('No claimable rewards found');
      return { success: false, message: 'No claimable rewards found' };
    }
    
    // Step 3: Generate claim data
    // Instead of using .claims.generate, let's use the correct API method
    // based on your TypeScript definition
    const claimDataResponse = await api.users({ address: userAddress }).get({
      query: { 
        chainId: 146,
        action: "generate_claim" // Adjust this based on your actual API
      }
    });
    
    // If your API structure is different, you might need something like:
    // const claimDataResponse = await fetch(`https://api.merkl.xyz/v4/users/${userAddress}/claims/generate?chainId=146`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ chainId: 146 })
    // }).then(res => res.json());
    
    if (!claimDataResponse.data) {
      console.log('Failed to generate claim data');
      return { success: false, message: 'Failed to generate claim data' };
    }
    
    // Step 4: Extract claim parameters
    const claimData: any = claimDataResponse.data;
    // Assuming the response format matches what the contract needs
    const { users, tokens, amounts, proofs } = claimData;
    
    // Convert amounts to BigInt
    const bigintAmounts = amounts.map(amount => BigInt(amount));
    
    // Step 5: Execute claim transaction
    // return await claimMerklRewards(privateKey, users, tokens, bigintAmounts, proofs);
    
  } catch (error) {
    console.error('Error in fetch and claim process:', error);
    throw error;
  }
}

/**
 * Retrieves information about active Aave USDC campaigns
 * @param api Merkl API instance
 * @returns Campaign information or null if not found
 */
async function getAaveMeritCampaigns() {
  try {
    console.log('Fetching Aave Merit program campaigns...');
    
    // Query for Aave opportunities specifically on Sonic
    const response = await api.opportunities.index.get({ 
      query: { 
        chainId: "146",
       // protocol: "aave",
        action: "LEND" // Specifically for lending actions
      }
    });
    
    if (!response.data || response.data.length === 0) {
      console.log('No Aave opportunities found');
      return null;
    }
    
    // Filter specifically for USDC.e supply opportunities
    const usdcOpportunities = response.data.filter(opportunity => 
      opportunity.type === "ERC20" && // ERC20 type is likely for deposit/supply actions
      opportunity.tokens && 
      opportunity.tokens.some(token => 
        token.symbol.toLowerCase().includes('usdc')
      )
    );
    
    if (usdcOpportunities.length === 0) {
      console.log('No USDC.e supply opportunities found');
      return null;
    }
    
    console.log(`Found ${usdcOpportunities.length} Aave USDC.e merit programs`);
    
    return usdcOpportunities;
  } catch (error) {
    console.error('Error fetching Aave Merit campaigns:', error);
    return null;
  }
}

/**
 * Calculate the maximum APR available across all Aave USDC campaigns
 * @param api Merkl API instance
 * @returns The maximum APR and associated campaign details
 */
// export async function getMaxAaveUsdcApr() {
//   try {
//     const campaigns = await getAaveUsdcCampaigns();
    
//     if (!campaigns || campaigns.length === 0) {
//       return { maxApr: 0, campaign: null };
//     }
    
//     // Find the campaign with the highest APR
//     let maxAprCampaign = campaigns[0];
//     for (const campaign of campaigns) {
//       if (campaign.apr > maxAprCampaign.apr) {
//         maxAprCampaign = campaign;
//       }
//     }
    
//     return {
//       maxApr: maxAprCampaign.apr,
//       campaign: maxAprCampaign
//     };
    
//   } catch (error) {
//     console.error('Error calculating max APR:', error);
//     return { maxApr: 0, campaign: null };
//   }
// }

/**
 * Verify if the address is the Merkl Distributor
 */
export async function verifyDistributorContract() {
  try {
    console.log(`Verifying if ${MERKL_DISTRIBUTOR_ADDRESS} is the Merkl Distributor...`);
    
    // Try to call the getMerkleRoot function - this should succeed if it's the Distributor
    const merkleRoot = await client.readContract({
      address: MERKL_DISTRIBUTOR_ADDRESS,
      abi: MERKL_DISTRIBUTOR_ABI,
      functionName: 'getMerkleRoot'
    });
    
    console.log('Successfully retrieved Merkle root:', merkleRoot);
    console.log('This confirms the address is the Merkl Distributor');
    return true;
  } catch (error) {
    console.error('Error verifying Distributor contract:', error);
    console.log('This address may not be the Merkl Distributor');
    return false;
  }
}

/**
 * Check how much a user has already claimed for a specific token
 * @param userAddress User's wallet address
 * @param tokenAddress Token address
 * @returns Object with claimed amount, timestamp, and merkleRoot
 */
export async function getClaimedAmount(userAddress: Address, tokenAddress: Address) {
  try {
    const claimInfo = await publicClient.readContract({
      address: MERKL_DISTRIBUTOR_ADDRESS,
      abi: MERKL_DISTRIBUTOR_ABI,
      functionName: 'claimed',
      args: [userAddress, tokenAddress]
    });
    
    return {
      amount: claimInfo[0],
      timestamp: new Date(Number(claimInfo[1]) * 1000), // Convert to JS date
      merkleRoot: claimInfo[2]
    };
  } catch (error) {
    console.error('Error getting claimed amount:', error);
    return null;
  }
}

/**
 * Check the claim recipient for a user's rewards
 * @param userAddress User's wallet address
 * @param tokenAddress Token address
 * @returns Address where rewards are sent when claimed
 */
export async function getClaimRecipient(userAddress: Address, tokenAddress: Address) {
  try {
    const recipient = await publicClient.readContract({
      address: MERKL_DISTRIBUTOR_ADDRESS,
      abi: MERKL_DISTRIBUTOR_ABI,
      functionName: 'claimRecipient',
      args: [userAddress, tokenAddress]
    });
    
    return recipient;
  } catch (error) {
    console.error('Error getting claim recipient:', error);
    return null;
  }
}

// ======== EXAMPLE USAGE =========

/**
 * Example of how to use these functions
 */
async function exampleUsage() {
  // Initialize your API wrapper
  // const api = MerklApi('https://api.merkl.xyz').v4;
  await verifyDistributorContract()
  // // User details
  // const userAddress = '0x70709614BF9aD5bBAb18E2244046d48f234a1583' as Address;
  // // // const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`; // Replace with real private key
  
  // // // Get campaign info
  // // const campaignInfo = await getAaveUsdcCampaigns();
  // // console.log('Campaign info:', JSON.stringify(campaignInfo, null, 2));
  
  // // // Get max APR
  // // const aprInfo = await getMaxAaveUsdcApr();
  // // console.log('Max APR:', aprInfo.maxApr);
  
  // // Only run this with a real private key
  // const claimResult = await fetchAndClaimMerklRewards(userAddress, '0x00000022');
  // console.log('Claim result:', claimResult);
}





// For API queries, you can work around the TypeScript issues by using query parameters like:
export async function getAaveMeritCampaigns2(api: any) {
  try {
    const response = await api.opportunities.index.get({ 
      query: { 
        chainId: "146",
        search: "aave", 
        action: "LEND", 
        tokens: "usdc"
      }
    });
    
    // Process response...
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}
exampleUsage()