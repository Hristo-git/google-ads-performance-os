
import { GoogleAdsApi } from 'google-ads-api';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debug() {
    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    });

    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';
    const customerId = "5334751502";

    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: refreshToken,
    });

    console.log(`Searching for ad group 'Дивани' in customer ${customerId}...`);
    try {
        const adGroups = await customer.query(`
            SELECT ad_group.id, ad_group.name 
            FROM ad_group 
            WHERE ad_group.name = 'Дивани'
        `);

        if (adGroups.length === 0) {
            console.log("Ad group 'Дивани' not found. Listing some ad groups to help find the right one...");
            const someAdGroups = await customer.query(`
                SELECT ad_group.id, ad_group.name 
                FROM ad_group 
                LIMIT 5
            `);
            console.log("Sample ad groups:", JSON.stringify(someAdGroups, null, 2));
            return;
        }

        const agId = adGroups[0].ad_group?.id;
        console.log(`Found Ad Group: ${adGroups[0].ad_group?.name} (ID: ${agId})`);

        console.log("Fetching ads and metrics for February 2026...");
        const ads: any[] = await customer.query(`
            SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.type,
                ad_group_ad.status,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                segments.date
            FROM ad_group_ad
            WHERE ad_group.id = ${agId}
              AND segments.date BETWEEN '2026-02-01' AND '2026-02-20'
        `);

        console.log(`Found ${ads.length} rows (segmented by date)`);

        const adMetrics: Record<string, any> = {};
        for (const row of ads) {
            const id = row.ad_group_ad?.ad?.id;
            if (!id) continue;
            if (!adMetrics[id]) {
                adMetrics[id] = {
                    id,
                    clicks: 0,
                    impressions: 0,
                    type: row.ad_group_ad?.ad?.type,
                    status: row.ad_group_ad?.status
                };
            }
            adMetrics[id].clicks += Number(row.metrics?.clicks || 0);
            adMetrics[id].impressions += Number(row.metrics?.impressions || 0);
        }

        console.log("Aggregated Ad Metrics:");
        console.log(JSON.stringify(adMetrics, null, 2));

        // Let's also check keywords for the same ad group to confirm total metrics
        console.log("Fetching keyword metrics for same period...");
        const kws: any[] = await customer.query(`
            SELECT
                ad_group_criterion.keyword.text,
                metrics.clicks,
                metrics.impressions
            FROM keyword_view
            WHERE ad_group.id = ${agId}
              AND segments.date BETWEEN '2026-02-01' AND '2026-02-20'
        `);
        console.log(`Found ${kws.length} keyword rows`);
        const kwTotal = kws.reduce((acc, row) => ({
            clicks: acc.clicks + Number(row.metrics?.clicks || 0),
            impressions: acc.impressions + Number(row.metrics?.impressions || 0)
        }), { clicks: 0, impressions: 0 });
        console.log("Keyword Totals:", kwTotal);

    } catch (e: any) {
        console.error("API Query failed:", e.message);
        if (e.response?.data) console.error("Error Details:", JSON.stringify(e.response.data, null, 2));
    }
}

debug().catch(console.error);
