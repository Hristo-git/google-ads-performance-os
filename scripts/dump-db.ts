const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const { supabaseAdmin } = require('../lib/supabase');

async function debugDb() {
    console.log('--- DATABASE DUMP (Last 20 Reports) ---');
    try {
        const { data, error } = await supabaseAdmin
            .from('gads_reports')
            .select('id, customer_id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching data:', error);
            return;
        }

        console.log(`Found ${data?.length || 0} reports in total database.`);
        if (data) {
            data.forEach((r: any, i: number) => {
                console.log(`${i}: [${r.created_at}] ID: ${r.id} | Customer: ${r.customer_id} | Title: ${r.title}`);
            });
        }
    } catch (e) {
        console.error('Fatal crash:', e);
    }
}

debugDb();
