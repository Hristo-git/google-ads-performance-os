const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const { supabaseAdmin } = require('../lib/supabase');

async function findMismatchedReports() {
    console.log('--- SCANNING FOR MISSING REPORTS (Last Hour) ---');
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    const { data: recent, error } = await supabaseAdmin
        .from('gads_reports')
        .select('id, customer_id, title, created_at')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Scan failed:', error);
        return;
    }

    console.log(`Found ${recent.length} reports in the last hour.`);
    recent.forEach((r, i) => {
        console.log(`${i}: [${r.created_at}] ID: ${r.id} | CID: ${r.customer_id} | Title: ${r.title}`);
    });

    // Check for "unknown" specifically
    const { count } = await supabaseAdmin
        .from('gads_reports')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', 'unknown');

    console.log(`Total "unknown" reports in DB: ${count}`);
}

findMismatchedReports();
