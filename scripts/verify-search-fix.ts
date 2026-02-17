import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from "dotenv";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
dotenv.config({ path: envPath });

async function verifySearchFix() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID;
    const customerId = "8277239615"; // Romania

    if (!refreshToken || !clientId || !clientSecret || !developerToken || !loginCustomerId) {
        console.error("Missing config");
        return;
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const customer = client.Customer({
            customer_id: customerId.replace(/-/g, ""),
            login_customer_id: loginCustomerId.replace(/-/g, ""),
            refresh_token: refreshToken,
        });

        const startDate = "2026-01-18";
        const endDate = "2026-02-17";

        console.log(`\n--- Verification: PMax Insight Loop ---`);

        // Step 1: Get PMax campaigns
        const pmaxCampaigns = await customer.query(`
            SELECT campaign.id, campaign.name 
            FROM campaign 
            WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' 
            AND campaign.status != 'REMOVED'
        `);

        console.log(`Found ${pmaxCampaigns.length} PMax campaigns.\n`);

        let totalPmaxConversions = 0;
        let brandedPmaxRows = 0;

        for (const camp of pmaxCampaigns) {
            const campId = camp.campaign.id;
            const campName = camp.campaign.name;

            const results = await customer.query(`
                SELECT 
                    campaign_search_term_insight.category_label,
                    metrics.conversions
                FROM 
                    campaign_search_term_insight
                WHERE 
                    segments.date BETWEEN '${startDate}' AND '${endDate}'
                    AND campaign_search_term_insight.campaign_id = '${campId}'
            `);

            if (results.length > 0) {
                const conv = results.reduce((sum: number, r: any) => sum + Number(r.metrics.conversions), 0);
                totalPmaxConversions += conv;

                const brandRows = results.filter((r: any) =>
                    r.campaign_search_term_insight.category_label.toLowerCase().includes('vellea') ||
                    r.campaign_search_term_insight.category_label.toLowerCase().includes('velea')
                );

                if (brandRows.length > 0) {
                    brandedPmaxRows += brandRows.length;
                    console.log(`Campaign: ${campName}`);
                    brandRows.forEach((r: any) => {
                        console.log(`  - [BRAND] ${r.campaign_search_term_insight.category_label}: ${r.metrics.conversions} conv`);
                    });
                }
            }
        }

        console.log(`\nVerification Summary:`);
        console.log(`Total PMax conversions found from insights: ${totalPmaxConversions.toFixed(2)}`);
        console.log(`Number of PMax brand category rows found: ${brandedPmaxRows}`);

    } catch (error) {
        console.error("Verification failed:", error);
    }
}

verifySearchFix();
