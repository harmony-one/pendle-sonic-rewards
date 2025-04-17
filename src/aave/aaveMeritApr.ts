import { formatTimestamp } from "../common/helper";
import { fetchCampaignDetails, fetchOpportunityDetailsFromCampaing, fetchUserRewardedCampaigns } from "./api/merkl";
import { MerklCampaign } from "./types";
import config from "./web3/config";


export async function fetchOpportunitiesForCampaignsByTokenAddress(
  campaignIds: string[],
  targetTokenAddress: string,
): Promise<any> { 
  const opportunities:any[] = [] 
  
  // Process each campaign ID
  for (const campaignId of campaignIds) {
    // Fetch campaign details
    const campaing: MerklCampaign | null = await fetchCampaignDetails(campaignId);
    // Skip if campaign not found
    if (!campaing) {
      continue;
    }
  
    // Check if the reward token address matches our target
    if (campaing.rewardToken && 
      campaing.rewardToken.address.toLowerCase() === targetTokenAddress.toLowerCase()) {
      // Check if the campaign has an opportunity ID
      if (campaing.opportunityId) {
        // Fetch opportunity details
        const opps = await fetchOpportunityDetailsFromCampaing(campaignId) // campaing.opportunityId);
        const opportunity = opps[0]

        if (opportunity) {
          // Add campaign reference to opportunity for context
          const opportunityWithCampaign = {
            opportunityId: opportunity.id,
            status: opportunity.status,
            tvl: opportunity.tvl,
            apr: opportunity.apr,
            dailyRewards: opportunity.dailyRewards,
            lastCampaignCreatedAt: opportunity.lastCampaignCreatedAt,
            campainId: campaing.id,
            campaignId: campaing.campaignId,
            startTimestamp: formatTimestamp(campaing.startTimestamp),
            endTimestamp: formatTimestamp(campaing.endTimestamp),
          };
          opportunities.push(opportunityWithCampaign);
        }
      }
    }
  }
  
  return opportunities;
}


async function aaveMeritApr() {
  const campains = await fetchUserRewardedCampaigns(config.contracts.userAddress)
  const opportunities = await fetchOpportunitiesForCampaignsByTokenAddress(campains, config.contracts.aSonUSDCAddress)
  console.log(opportunities)
}

aaveMeritApr()
