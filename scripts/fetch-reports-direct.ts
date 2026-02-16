require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase credentials");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: reports, error } = await supabase
        .from('gads_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching reports:", error);
        return;
    }

    console.log(`Fetched ${reports.length} reports.`);

    reports.forEach(r => {
        console.log(`\n--- Report ID: ${r.id} ---`);
        console.log(`Created At: ${r.created_at}`);
        console.log(`Title: ${r.title}`);
        console.log(`Model: ${r.model}`);
        console.log(`Settings:`, JSON.stringify(r.metadata?.settings));
        console.log(`Period Label:`, r.metadata?.periodLabel);
        if (r.analysis) {
            console.log(`Analysis Length: ${r.analysis.length}`);
            console.log(`Snippet: ${r.analysis.substring(0, 150).replace(/\n/g, ' ')}...`);
        }
    });
}

main();
