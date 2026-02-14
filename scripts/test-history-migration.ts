
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config({ path: '.env.local' });
console.log('Environment loaded.');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'FOUND' : 'MISSING');

async function testHistoryMigration() {
    console.log('🧪 Starting History Migration Test...');

    // Dynamic import to ensure env vars are loaded first
    const { saveReport, getReports, deleteReport, GadsReport } = await import('../lib/supabase');

    const testReportId = `test_report_${Date.now()}`;
    const testCustomerId = '1234567890';

    const testReport = {
        id: testReportId,
        customer_id: testCustomerId,
        template_id: 'test_template',
        title: 'Test Verification Report',
        analysis: '# Test Analysis\n\nThis is a test report content.',
        audience: 'Executive',
        language: 'English',
        model: 'TestModel',
        metadata: { test: true }
    };

    try {
        // 1. Save Report
        console.log(`\n📝 Saving test report (ID: ${testReportId})...`);
        // @ts-ignore
        const saveResult = await saveReport(testReport);

        if (saveResult.saved) {
            console.log('✅ Report saved successfully.');
        } else {
            console.error('❌ Failed to save report:', saveResult.error);
            process.exit(1);
        }

        // 2. Fetch Reports
        console.log(`\n🔍 Fetching reports for customer ${testCustomerId}...`);
        const reports = await getReports(testCustomerId);
        console.log(`Found ${reports.length} reports.`);

        const found = reports.find((r: any) => r.id === testReportId);
        if (found) {
            console.log('✅ Found the test report in history.');
            console.log('   Title:', found.title);
            console.log('   Created At:', found.created_at);
        } else {
            console.error('❌ Test report NOT found in history.');
            process.exit(1);
        }

        // 3. Cleanup
        console.log(`\n🗑️ Cleaning up (Deleting report ${testReportId})...`);
        const deleted = await deleteReport(testReportId);
        if (deleted) {
            console.log('✅ Test report deleted.');
        } else {
            console.error('❌ Failed to delete test report.');
        }

        console.log('\n✨ Verification passed!');

    } catch (error) {
        console.error('❌ Unexpected error during test:', error);
        process.exit(1);
    }
}

testHistoryMigration();
