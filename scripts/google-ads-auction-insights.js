/**
 * Google Ads Script to Export Auction Insights to Google Sheets
 * 
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Copy the Sheet URL.
 * 3. Paste the URL into the CONFIG object below.
 * 4. Run this script in your Google Ads account (Tools & Settings > Bulk Actions > Scripts).
 * 5. Schedule it to run Daily.
 */

const CONFIG = {
    // REPLACE THIS WITH YOUR SHEET URL
    SPREADSHEET_URL: 'YOUR_GOOGLE_SHEET_URL_HERE',

    // Name of the tab/sheet to write to. Will be created if it doesn't exist.
    SHEET_NAME: 'Auction_Insights_Data',

    // Date range for the report (LAST_30_DAYS, LAST_7_DAYS, YESTERDAY, etc.)
    DATE_RANGE: 'LAST_30_DAYS'
};

function main() {
    var spreadsheet = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
    var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

    // Create sheet if it doesn't exist
    if (!sheet) {
        sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
    }

    sheet.clear(); // Clear old data

    // Define the report query
    // Note: We use 'segments.date' to get daily data if needed, or just aggregate.
    // Here we'll get a summary for the date range.
    var query =
        "SELECT " +
        "segments.date, " +
        "auction_insight_domain_view.display_name, " +
        "metrics.auction_insight_search_impression_share, " +
        "metrics.auction_insight_search_overlap_rate, " +
        "metrics.auction_insight_search_position_above_rate, " +
        "metrics.auction_insight_search_top_impression_share, " +
        "metrics.auction_insight_search_absolute_top_impression_share, " +
        "metrics.auction_insight_search_outranking_share " +
        "FROM " +
        "auction_insight_domain_view " +
        "WHERE " +
        "campaign.status = 'ENABLED' " +
        "AND segments.date DURING " + CONFIG.DATE_RANGE + " " +
        "ORDER BY " +
        "metrics.auction_insight_search_impression_share DESC";

    var report = AdsApp.report(query);

    // Write headers
    var headers = [
        'Date',
        'Domain',
        'Impression Share',
        'Overlap Rate',
        'Position Above Rate',
        'Top of Page Rate',
        'Abs. Top of Page Rate',
        'Outranking Share'
    ];

    sheet.appendRow(headers);

    var rows = report.rows();
    var data = [];

    while (rows.hasNext()) {
        var row = rows.next();
        data.push([
            row['segments.date'],
            row['auction_insight_domain_view.display_name'],
            row['metrics.auction_insight_search_impression_share'],
            row['metrics.auction_insight_search_overlap_rate'],
            row['metrics.auction_insight_search_position_above_rate'],
            row['metrics.auction_insight_search_top_impression_share'],
            row['metrics.auction_insight_search_absolute_top_impression_share'],
            row['metrics.auction_insight_search_outranking_share']
        ]);
    }

    if (data.length > 0) {
        // Write all data in one batch for performance
        sheet.getRange(2, 1, data.length, headers.length).setValues(data);
    }

    Logger.log('Export complete. ' + data.length + ' rows written.');
}
