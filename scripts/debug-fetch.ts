
async function debugFetch() {
    try {
        // 1. Fetch campaigns to get a valid name
        console.log("Fetching campaigns...");
        const camRes = await fetch("http://localhost:4000/api/windsor/campaigns");
        const camData = await camRes.json();

        if (!camData.campaigns || camData.campaigns.length === 0) {
            console.log("No campaigns found.");
            return;
        }

        const campaignName = camData.campaigns[0].name;
        console.log(`Found campaign: "${campaignName}"`);

        // 2. Fetch ad groups for that campaign
        const url = `http://localhost:4000/api/windsor/ad-groups?campaign=${encodeURIComponent(campaignName)}`;
        console.log(`Fetching ad groups from: ${url}`);

        const agRes = await fetch(url);
        const agData = await agRes.json();

        console.log("Ad Group Response:", JSON.stringify(agData, null, 2));

    } catch (error) {
        console.error("Fetch error:", error);
    }
}

debugFetch();
