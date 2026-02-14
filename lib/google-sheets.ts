import { google } from 'googleapis';

export interface AuctionInsightsRow {
    date: string;
    domain: string;
    impressionShare: number;
    overlapRate: number;
    positionAboveRate: number;
    topOfPageRate: number;
    absTopOfPageRate: number;
    outrankingShare: number;
}

export async function getAuctionInsightsFromSheet(spreadsheetId: string): Promise<AuctionInsightsRow[]> {
    if (!spreadsheetId) {
        throw new Error("Spreadsheet ID is missing");
    }

    // Try to load Service Account credentials from env
    // We expect GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY
    // OR GOOGLE_APPLICATION_CREDENTIALS path
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        // If credentials above are missing, GoogleAuth will try to find GOOGLE_APPLICATION_CREDENTIALS
    });

    // Fallback: If no service account, try OAuth2 (reusing Ads creds - might fail if scope missing)
    // process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_ADS_REFRESH_TOKEN

    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Auction_Insights_Data!A2:H', // Skip header
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }

        return rows.map((row) => ({
            date: row[0] || '',
            domain: row[1] || '',
            impressionShare: parseFloat(row[2]) || 0,
            overlapRate: parseFloat(row[3]) || 0,
            positionAboveRate: parseFloat(row[4]) || 0,
            topOfPageRate: parseFloat(row[5]) || 0,
            absTopOfPageRate: parseFloat(row[6]) || 0,
            outrankingShare: parseFloat(row[7]) || 0,
        }));

    } catch (error) {
        console.error("Error fetching Auction Insights from Sheet:", error);
        throw error;
    }
}
