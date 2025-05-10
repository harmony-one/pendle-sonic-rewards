import { MerklApi } from '@merkl/api'
import { MerklCampaign } from '../types';

const api = MerklApi('https://api.merkl.xyz').v4;

function filterBaseCampaignIds(
  userRewardsResponse: any[], 
  tokenAddress?: string
): string[] {
  // Initialize array to store the filtered campaign IDs
  const baseCampaignIds: string[] = [];
  
  // Process each chain's rewards
  for (const chainRewards of userRewardsResponse) {
    // Process each reward token group
    for (const reward of chainRewards.rewards) {
      // If tokenAddress is provided, check if this reward is for the specified token
      if (tokenAddress && reward.token.address.toLowerCase() !== tokenAddress.toLowerCase()) {
        continue; // Skip rewards for other tokens
      }
      
      // Filter breakdowns with reason 'base' and extract campaign IDs
      const baseBreakdowns = reward.breakdowns.filter(breakdown => 
        breakdown.reason === 'base'
      );
      
      // Add campaign IDs to our result array
      for (const breakdown of baseBreakdowns) {
        baseCampaignIds.push(breakdown.campaignId);
      }
    }
  }
  
  // Remove any duplicate campaign IDs
  return [...new Set(baseCampaignIds)];
}

/**
 * Fetches active campaigns related to USDC.e supply on Aave/Sonic
 * @returns List of active campaigns
 */
export async function fetchUserRewardedCampaigns(userAddress: string): Promise<any> {
  try {
    const response = await api.users({ address : userAddress}).rewards.get({ query: { chainId: [146] }})
    response.data && console.log(response.data[0])
    const campains = response.data && filterBaseCampaignIds(response.data)
    return campains
  } catch (error) {
    console.error('Error fetching active campaigns:', error);
    return [];
  }
}


/**
 * Fetch detailed information about a specific campaign
 * @param campaignId The campaign ID to fetch
 * @returns Campaign details
 */
export async function fetchCampaignDetails(campaignId: string): Promise<MerklCampaign | null> {
  try {
    const response = await api.campaigns.index.get({ query: { campaignId: campaignId }})
    const campaigns = response.data && response.data[0]
    return campaigns as unknown as MerklCampaign
  
  } catch (error) {
    console.error(`Error fetching campaign ${campaignId}:`, error);
    return null;
  }
}

/**
 * Fetches TVL and other opportunity details for calculating APR
 * @param campaignId Campaign ID to get opportunity details for
 * @returns Opportunity details
 */
export async function fetchOpportunityDetailsFromcampaign(campaningId: string): Promise<any> {
  try {
    const response = await api.opportunities.index.get({ query: { campaignId: campaningId }})
    return response.data;
  } catch (error) {
    console.error(`Error fetching opportunity from ${campaningId}:`, error);
    return null;
  }
}



// export const getAaveOpportunities = async () => {
//   const { data, status } = await api.opportunities.index.get({ query: { chainId: "146" } });
//   const filter1 = data?.map((opp) => { opp.tokens})
//   console.log(filter1)
//   const fco = await api.campaigns.index.get({ query: { campaignId: '0x88e7d20994be6a97dd5af665e6f6c3a0c042b7716e99355de81002fee09dc9fc' }})// { tokenAddress: '0x6C5E14A212c1C3e4Baf6f871ac9B1a969918c131' }})

//   const fcoFilter = fco.data?.filter((opp) => opp.chain.id === 146)
//   console.log(fcoFilter?.length, fcoFilter)
//   const filter = data?.filter((opp) => opp.protocol?.name.toLocaleLowerCase() == 'aave')
//   return filter

// } 
