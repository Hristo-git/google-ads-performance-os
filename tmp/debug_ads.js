
const { GoogleAdsApi } = require('google-ads-api');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debug() {
    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    });

    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';
    const mccId = "3151945525";
    const customerId = "5334827744";

    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: refreshToken,
        login_customer_id: mccId,
    });

    const startDate = '2026-02-01';
    const endDate = '2026-02-20';

    try {
        const adGroups = await customer.query(`
            SELECT ad_group.id, ad_group.name, metrics.clicks
            FROM ad_group
            WHERE ad_group.name = 'Дивани'
              AND segments.date BETWEEN '${startDate}' AND '${endDate}'
            LIMIT 1
        `);

        if (adGroups.length === 0) {
            console.log("No metrics found for 'Дивани' in this range.");
            return;
        }
        const agId = adGroups[0].ad_group.id;
        console.log(`Ad Group ${adGroups[0].ad_group.name} has ${adGroups[0].metrics.clicks} clicks in this range.`);

        const query = `
            SELECT 
                ad_group_ad.ad.id,
                metrics.clicks,
                ad_group_ad.status,
                ad_group_ad.ad_strength,
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad.responsive_display_ad.headlines,
                ad_group_ad.ad.responsive_display_ad.descriptions,
                ad_group_ad.ad.responsive_display_ad.youtube_videos
            FROM ad_group_ad 
            WHERE ad_group.name = 'Дивани'
            AND segments.date BETWEEN '2026-02-01' AND '2026-02-20'
        `;

        const rows = await customer.query(query);
        console.log(`Found ${rows.length} ad metric rows.`);

        let totalClicks = 0;
        rows.forEach(row => {
            const clicks = Number(row.metrics.clicks || 0);
            totalClicks += clicks;
            if (clicks > 0) {
                console.log(`  Ad ID ${row.ad_group_ad.ad.id}: ${clicks} clicks (Status: ${row.ad_group_ad.status}, Strength: ${row.ad_group_ad.ad_strength})`);
                if (row.ad_group_ad.ad.responsive_search_ad) {
                    console.log(`    RSA Headlines: ${row.ad_group_ad.ad.responsive_search_ad.headlines?.length || 0}`);
                }
                if (row.ad_group_ad.ad.responsive_display_ad) {
                    console.log(`    RDA Videos: ${row.ad_group_ad.ad.responsive_display_ad.youtube_videos?.length || 0}`);
                }
            }
        });
        console.log(`Total Ad Clicks: ${totalClicks}`);

    } catch (e) {
        console.error("  API Error:", e.message || e);
    }
}

debug().catch(console.error);
