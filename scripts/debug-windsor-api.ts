/**
 * Debug Windsor API with full field set
 */
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debugWindsor() {
    const apiKey = process.env.WINDSOR_API_KEY;
    if (!apiKey) {
        console.error("✗ WINDSOR_API_KEY not found");
        return;
    }

    const fields = [
        "campaign",
        "date",
        "clicks",
        "impressions",
        "cost",
        "conversions",
        "conversion_value",
        "search_impression_share",
        "search_rank_lost_impression_share",
        "search_budget_lost_impression_share",
        "advertising_channel_type",
        "advertising_channel_sub_type",
        "bidding_strategy_type"
    ].join(",");

    const url = `https://connectors.windsor.ai/google_ads?api_key=${apiKey}&fields=${fields}&date_preset=last_7d`;

    console.log("Testing URL:", url.replace(apiKey, "***"));

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const text = await res.text();
            console.error(`✗ API Error ${res.status}:`, text);
            return;
        }
        const data = await res.json();
        console.log(`✓ Data count: ${data.data?.length || 0}`);
        if (data.data?.length > 0) {
            console.log("Sample record:", JSON.stringify(data.data[0], null, 2));
        } else {
            console.log("! No data returned.");
        }
    } catch (error) {
        console.error("✗ Fetch Error:", error);
    }
}

debugWindsor();
