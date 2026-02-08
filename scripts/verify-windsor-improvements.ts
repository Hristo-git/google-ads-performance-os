
import fetch from "node-fetch";

const BASE_URL = "http://localhost:4000/api/windsor";

async function verifyImprovements() {
    console.log("--- Verifying Keywords Granularity ---");
    // Need a campaign/adgroup that exists. I'll pick one from previous logs if possible, or just list keywords
    // We'll trust the default drill down will find something or we list keywords directly
    try {
        const campRes = await fetch(`${BASE_URL}/campaigns`);
        const campData = await campRes.json();
        const campaign = campData.campaigns?.[0]?.name;

        if (campaign) {
            console.log(`Using Campaign: ${campaign}`);
            const adGroupRes = await fetch(`${BASE_URL}/ad-groups?campaign=${encodeURIComponent(campaign)}`);
            const adGroupData = await adGroupRes.json();
            const adGroup = adGroupData.adGroups?.[0]?.name;

            if (adGroup) {
                console.log(`Using AdGroup: ${adGroup}`);

                // Check Keywords
                const kwRes = await fetch(`${BASE_URL}/keywords?campaign=${encodeURIComponent(campaign)}&adGroup=${encodeURIComponent(adGroup)}`);
                const kwData = await kwRes.json();
                console.log(`Keywords count: ${kwData.keywords?.length}`);
                if (!kwData.keywords) {
                    console.log("❌ Keywords Fetch Error Response:", JSON.stringify(kwData, null, 2));
                }
                const kw = kwData.keywords?.[0];
                if (kw) {
                    console.log("Keyword Sample:", JSON.stringify({
                        text: kw.text,
                        qualityScore: kw.qualityScore,
                        expCTR: kw.expectedCtr,
                        lpExp: kw.landingPageExperience
                    }, null, 2));
                }

                // Check Ads
                const adsRes = await fetch(`${BASE_URL}/ads?campaign=${encodeURIComponent(campaign)}&adGroup=${encodeURIComponent(adGroup)}`);
                const adsData = await adsRes.json();
                const ad = adsData.ads?.[0];
                if (ad) {
                    console.log("Ad Sample:", JSON.stringify({
                        headlinesCount: ad.headlinesCount,
                        descriptionsCount: ad.descriptionsCount,
                        descriptions: ad.descriptions
                    }, null, 2));
                }

                // Check Negatives
                const negRes = await fetch(`${BASE_URL}/negative-keywords?campaign=${encodeURIComponent(campaign)}`);
                const negData = await negRes.json();
                console.log(`Negatives found: ${negData.negatives?.length}`);
            }
        }
    } catch (e) {
        console.error("Verification failed:", e);
    }
}

verifyImprovements();
