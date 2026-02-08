/**
 * Verification script for Asset Group integration
 */
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyAssetGroups() {
    const apiKey = process.env.WINDSOR_API_KEY;
    if (!apiKey) {
        console.error("✗ WINDSOR_API_KEY not found in .env.local");
        return;
    }

    console.log("=== Verifying Asset Group Data via Windsor.ai ===\n");

    const fields = "campaign,asset_group,clicks,impressions,cost,conversions,conversion_value,advertising_channel_type";
    const url = `https://connectors.windsor.ai/google_ads?api_key=${apiKey}&fields=${fields}&date_preset=last_7d`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            console.log(`✓ Total records: ${data.data.length}`);

            const pmaxRecords = data.data.filter((r: any) =>
                r.advertising_channel_type === 'PERFORMANCE_MAX' ||
                r.campaign.toLowerCase().includes('pmax')
            );

            console.log(`✓ PMax records: ${pmaxRecords.length}`);

            const withAssetGroup = pmaxRecords.filter((r: any) => r.asset_group);
            console.log(`✓ PMax records with asset_group: ${withAssetGroup.length}`);

            if (withAssetGroup.length > 0) {
                const uniqueGroups = Array.from(new Set(withAssetGroup.map((r: any) => r.asset_group)));
                console.log(`✓ Unique Asset Groups found: ${uniqueGroups.length}`);
                console.log(`Sample Asset Group: ${uniqueGroups[0]}`);
                console.log("✓ VERIFICATION SUCCESSFUL: Asset Group data is available.");
            } else if (pmaxRecords.length > 0) {
                console.log("! PMax campaigns found but no asset_group field populated. This might be a Windsor limitation for this specific account.");
            } else {
                console.log("! No PMax campaigns found in the last 7 days.");
            }
        } else {
            console.log("✗ No data returned from Windsor.ai.");
        }
    } catch (error) {
        console.error("✗ Error:", error);
    }
}

verifyAssetGroups();
