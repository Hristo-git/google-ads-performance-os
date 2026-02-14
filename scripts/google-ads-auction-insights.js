/**
 * Google Ads Script - SINGLE ACCOUNT VERSION (Optimized)
 * 
 * Target Sheet: https://docs.google.com/spreadsheets/d/1nmSYTJK2Me11-bcVtNBolb8wXMViD6i8gdBEK6EOmd4/edit
 * 
 * INSTRUCTIONS:
 * 1. RUN THIS SCRIPT IN THE CLIENT ACCOUNT (e.g. Videnov.BG), NOT IN MCC.
 * 2. It does NOT use AdsManagerApp.
 */

const CONFIG = {
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1nmSYTJK2Me11-bcVtNBolb8wXMViD6i8gdBEK6EOmd4/edit',
    SHEET_NAME: 'Auction Insights',
    DATE_RANGE: 'LAST_30_DAYS',
    LIMIT: 50
};

function main() {
    Logger.log('>>> SINGLE ACCOUNT SCRIPT STARTED');
    var accountName = AdsApp.currentAccount().getName();
    Logger.log('Account: ' + accountName);

    // Step 1: Find Active Search Campaigns
    Logger.log('Step 1: Fetching top active campaigns...');
    var campaignIds = [];

    // We get campaigns that have had impressions to ensure they have data
    var campQuery =
        "SELECT campaign.id, campaign.name " +
        "FROM campaign " +
        "WHERE campaign.status = 'ENABLED' " +
        "AND campaign.advertising_channel_type = 'SEARCH' " +
        "AND metrics.impressions > 0 " +
        "AND segments.date DURING " + CONFIG.DATE_RANGE + " " +
        "LIMIT 10";

    try {
        var campSearch = AdsApp.search(campQuery);
        while (campSearch.hasNext()) {
            campaignIds.push(campSearch.next().campaign.id);
        }
    } catch (e) {
        Logger.log('Error listing campaigns: ' + e.message);
    }

    if (campaignIds.length === 0) {
        Logger.log('>>> No active Search campaigns with impressions found. Trying without impression filter...');
        // Fallback: Try without impression filter
        var campQuery2 = "SELECT campaign.id FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' LIMIT 10";
        var campSearch2 = AdsApp.search(campQuery2);
        while (campSearch2.hasNext()) {
            campaignIds.push(campSearch2.next().campaign.id);
        }
    }

    if (campaignIds.length === 0) {
        Logger.log('>>> NO CAMPAIGNS FOUND. Cannot run Auction Insights.');
        return;
    }

    Logger.log('Found ' + campaignIds.length + ' campaigns to analyze.');

    // Step 2: Query Auction Insights
    var idsString = campaignIds.join(',');

    // Using AdsApp.report (Robust Mode) for Single Account
    var gaqlQuery =
        "SELECT " +
        "  auction_insight_domain_view.display_name, " +
        "  metrics.auction_insight_search_impression_share, " +
        "  metrics.auction_insight_search_overlap_rate, " +
        "  metrics.auction_insight_search_outranking_share " +
        "FROM auction_insight_domain_view " +
        "WHERE campaign.id IN (" + idsString + ") " +
        "  AND segments.date DURING " + CONFIG.DATE_RANGE;

    Logger.log('Step 2: Querying Auction Insights resource...');

    try {
        var report = AdsApp.report(gaqlQuery);
        var rows = report.rows();

        var dataMap = {};
        var foundRows = 0;

        while (rows.hasNext()) {
            var row = rows.next();
            foundRows++;

            // Note: report.rows() returns objects where keys are "Table.Field" string
            var domain = row['auction_insight_domain_view.display_name'] || 'You';
            var share = parseFloat(row['metrics.auction_insight_search_impression_share']) || 0;
            var overlap = row['metrics.auction_insight_search_overlap_rate'] || 0;
            var outranking = row['metrics.auction_insight_search_outranking_share'] || 0;

            if (!dataMap[domain] || share > dataMap[domain].share) {
                dataMap[domain] = {
                    share: share,
                    overlap: overlap,
                    outranking: outranking
                };
            }
        }

        Logger.log('Found ' + foundRows + ' raw rows of insights.');

        var data = [];
        for (var domain in dataMap) {
            data.push([
                accountName, // Add Account Name column for consistency
                domain,
                dataMap[domain].share,
                dataMap[domain].overlap,
                0, 0, 0,
                dataMap[domain].outranking
            ]);
        }

        if (data.length === 0) {
            Logger.log('>>> CAMPAIGNS FOUND, BUT NO AUCTION INSIGHTS DATA returned.');
            return;
        }

        // Sort
        data.sort(function (a, b) { return b[2] - a[2]; }); // Sort by Share (index 2)
        data = data.slice(0, CONFIG.LIMIT);

        // Step 3: Write
        Logger.log('Step 3: Writing to sheet...');
        var spreadsheet = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
        var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME) || spreadsheet.insertSheet(CONFIG.SHEET_NAME);
        sheet.clear();
        var headers = ['Account', 'Domain', 'Impression Share', 'Overlap Rate', 'Position Above Rate', 'Top of Page Rate', 'Abs. Top of Page Rate', 'Outranking Share'];
        sheet.appendRow(headers);
        sheet.getRange(2, 1, data.length, headers.length).setValues(data);
        Logger.log('>>> SUCCESS! Data written.');

    } catch (e) {
        Logger.log('!!! ERROR: ' + e.message);
        Logger.log('If this says "Could not identify resource", then Auction Insights via Scripts is NOT supported for your specific account setup.');
    }
}
