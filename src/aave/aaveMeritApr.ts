import { formatTimestamp } from "../common/helper";
import { fetchCampaignDetails, fetchOpportunityDetailsFromcampaign, fetchUserRewardedCampaigns } from "./api/merkl";
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
    const campaign: MerklCampaign | null = await fetchCampaignDetails(campaignId);
    // Skip if campaign not found
    if (!campaign) {
      continue;
    }
  
    // Check if the reward token address matches our target
    if (campaign.rewardToken && 
      campaign.rewardToken.address.toLowerCase() === targetTokenAddress.toLowerCase()) {
      // Check if the campaign has an opportunity ID
      if (campaign.opportunityId) {
        // Fetch opportunity details
        const opps = await fetchOpportunityDetailsFromcampaign(campaignId) // campaign.opportunityId);
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
            campainId: campaign.id,
            campaignId: campaign.campaignId,
            startTimestamp: formatTimestamp(campaign.startTimestamp),
            endTimestamp: formatTimestamp(campaign.endTimestamp),
          };
          opportunities.push(opportunityWithCampaign);
        }
      }
    }
  }
  
  return opportunities;
}


async function aaveMeritApr() {
  const rewards = await fetchUserRewardedCampaigns("0x70709614BF9aD5bBAb18E2244046d48f234a1583")
  
  const campains = await fetchUserRewardedCampaigns(config.contracts.userAddress)
  campains && campains.forEach(async c => {
    const details = await fetchOpportunityDetailsFromcampaign(c)
    console.log(details)
  });
  // console.log(campains)
  // const opportunities = await fetchOpportunitiesForCampaignsByTokenAddress(campains, config.contracts.aSonUSDCAddress)
  // console.log(opportunities)
}

aaveMeritApr()
