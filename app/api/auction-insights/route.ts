import { NextRequest, NextResponse } from 'next/server';
import { getAuctionInsightsFromSheet } from '@/lib/google-sheets';

export async function GET(req: NextRequest) {
    // 1. Check for Spreadsheet ID in query or env
    // We'll prioritize a query param if we want to allow users to set it in UI, 
    // but likely it's an env var or settings.
    const searchParams = req.nextUrl.searchParams;
    let spreadsheetId = searchParams.get('spreadsheetId') || process.env.GOOGLE_SHEETS_AUCTION_INSIGHTS_ID;

    if (!spreadsheetId) {
        return NextResponse.json(
            { error: 'Missing Spreadsheet ID. Please configure GOOGLE_SHEETS_AUCTION_INSIGHTS_ID or pass ?spreadsheetId=' },
            { status: 400 }
        );
    }

    try {
        const data = await getAuctionInsightsFromSheet(spreadsheetId);
        return NextResponse.json({ data });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to fetch auction insights' },
            { status: 500 }
        );
    }
}
