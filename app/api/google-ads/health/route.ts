import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
    getCampaigns,
    getAdGroups,
    getKeywordsWithQS,
    getAdsWithStrength,
    getNegativeKeywords,
    getSearchTerms,
    getAuctionInsights,
    getAccountDeviceStats,

    getChangeHistory,
    getAssetPerformance,
    getConversionActionsAccount,
    getPMaxProductPerformance
} from "@/lib/google-ads";

import { runPreAnalysis, type SearchTermInput } from "@/lib/account-health";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        if (!customerId) {
            return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
        }

        // Use environment variable for refresh token (same as other routes)
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: "Configuration Error - Missing Refresh Token in environment" }, { status: 500 });
        }

        const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;

        console.log(`[API/Health] Fetching full context for customer: ${customerId}`);

        // Fetch data with individual error handling to identify failing sources
        let campaigns: any[] = [];
        let adGroups: any[] = [];
        let keywords: any[] = [];
        let ads: any[] = [];
        let negatives: any[] = [];
        let searchTerms: any[] = [];
        const errors: string[] = [];

        try {
            console.log(`[API/Health] Fetching campaigns...`);
            campaigns = await getCampaigns(refreshToken, customerId, dateRange);
            console.log(`[API/Health] Got ${campaigns.length} campaigns`);
        } catch (e: any) {
            errors.push(`campaigns: ${e.message}`);
            console.error(`[API/Health] Failed to fetch campaigns:`, e);
        }

        try {
            console.log(`[API/Health] Fetching adGroups...`);
            adGroups = await getAdGroups(refreshToken, undefined, customerId, dateRange);
            console.log(`[API/Health] Got ${adGroups.length} adGroups`);
        } catch (e: any) {
            errors.push(`adGroups: ${e.message}`);
            console.error(`[API/Health] Failed to fetch adGroups:`, e);
        }

        try {
            console.log(`[API/Health] Fetching keywords with QS...`);
            keywords = await getKeywordsWithQS(refreshToken, undefined, customerId, dateRange);
            console.log(`[API/Health] Got ${keywords.length} keywords`);
            if (keywords.length > 0) {
                console.log(`[API/Health] Sample keyword:`, JSON.stringify(keywords[0]));
                const withQS = keywords.filter(k => k.qualityScore !== null && k.qualityScore !== undefined);
                console.log(`[API/Health] Keywords with QS data: ${withQS.length}/${keywords.length}`);
            }
        } catch (e: any) {
            errors.push(`keywords: ${e.message}`);
            console.error(`[API/Health] Failed to fetch keywords:`, e);
        }

        try {
            console.log(`[API/Health] Fetching ads...`);
            ads = await getAdsWithStrength(refreshToken, undefined, customerId, undefined, dateRange);
            console.log(`[API/Health] Got ${ads.length} ads`);
        } catch (e: any) {
            errors.push(`ads: ${e.message}`);
            console.error(`[API/Health] Failed to fetch ads:`, e);
        }

        try {
            console.log(`[API/Health] Fetching negatives...`);
            negatives = await getNegativeKeywords(refreshToken, undefined, customerId);
            console.log(`[API/Health] Got ${negatives.length} negatives`);
        } catch (e: any) {
            errors.push(`negatives: ${e.message}`);
            console.error(`[API/Health] Failed to fetch negatives:`, e);
        }

        try {
            console.log(`[API/Health] Fetching searchTerms...`);
            searchTerms = await getSearchTerms(refreshToken, customerId, dateRange);
            console.log(`[API/Health] Got ${searchTerms.length} searchTerms`);
        } catch (e: any) {
            errors.push(`searchTerms: ${e.message}`);
            console.error(`[API/Health] Failed to fetch searchTerms:`, e);
        }

        let auctionInsights: any[] = [];
        try {
            console.log(`[API/Health] Fetching auctionInsights...`);
            // Pass undefined as campaignId to get account-level insights
            auctionInsights = await getAuctionInsights(refreshToken, undefined, customerId, dateRange);
            console.log(`[API/Health] Got ${auctionInsights.length} auctionInsights`);
        } catch (e: any) {
            console.error(`[API/Health] Failed to fetch auctionInsights:`, e);
            // Don't fail the whole request, just log
        }

        let deviceStats: any[] = [];
        try {
            console.log(`[API/Health] Fetching deviceStats...`);
            deviceStats = await getAccountDeviceStats(refreshToken, customerId, dateRange);
            console.log(`[API/Health] Got ${deviceStats.length} deviceStats`);
            if (deviceStats.length > 0) {
                console.log(`[API/Health] Device Stats Sample:`, JSON.stringify(deviceStats.slice(0, 2)));
            }
        } catch (e: any) {
            console.error(`[API/Health] Failed to fetch deviceStats:`, e);
        }


        // ── NEW: Diagnostic Data Fetches ──
        let assetPerformance: any[] = [];
        try {
            assetPerformance = await getAssetPerformance(refreshToken, customerId, dateRange);
            console.log(`[API/Health] Got ${assetPerformance.length} assets`);
            if (assetPerformance.length > 0) {
                console.log(`[API/Health] Sample asset:`, JSON.stringify(assetPerformance[0]));
                const approved = assetPerformance.filter(a =>
                    a.approvalStatus === 'APPROVED' ||
                    a.approvalStatus === 'APPROVED_LIMITED' ||
                    a.approvalStatus === 'ENABLED'  // API v22: enabled = approved
                );
                const disapproved = assetPerformance.filter(a =>
                    a.approvalStatus !== 'APPROVED' &&
                    a.approvalStatus !== 'APPROVED_LIMITED' &&
                    a.approvalStatus !== 'ENABLED' &&
                    a.approvalStatus !== 'UNKNOWN'
                );
                console.log(`[API/Health] Asset approval stats: ${approved.length} approved, ${disapproved.length} disapproved, ${assetPerformance.length - approved.length - disapproved.length} unknown/other`);
            }
        } catch (e: any) { console.error(`[API/Health] Failed assetPerformance:`, e); }

        let changeEvents: any[] = [];
        try {
            changeEvents = await getChangeHistory(refreshToken, customerId, dateRange);
        } catch (e: any) { console.error(`[API/Health] Failed changeEvents:`, e); }

        let conversionActions: any[] = [];
        try {
            conversionActions = await getConversionActionsAccount(refreshToken, customerId, dateRange);
        } catch (e: any) { console.error(`[API/Health] Failed conversionActions:`, e); }


        let pmaxProducts: any[] = [];
        try {
            pmaxProducts = await getPMaxProductPerformance(refreshToken, customerId, dateRange);
        } catch (e: any) { console.error(`[API/Health] Failed pmaxProducts:`, e); }


        if (auctionInsights.length > 0) {
            console.log(`[API/Health] Auction Insights Sample:`, JSON.stringify(auctionInsights.slice(0, 2)));
        }

        if (errors.length > 0) {
            console.warn(`[API/Health] Some data sources failed:`, errors);
        }

        console.log(`[API/Health] Data counts: campaigns=${campaigns.length}, adGroups=${adGroups.length}, keywords=${keywords.length}, ads=${ads.length}, negatives=${negatives.length}, searchTerms=${searchTerms.length}`);

        // Map search terms to the format expected by runPreAnalysis
        const searchTermInputs: SearchTermInput[] = searchTerms.map((st: any) => ({
            searchTerm: st.term,
            impressions: st.impressions,
            clicks: st.clicks,
            cost: st.cost,
            conversions: st.conversions,
            conversionValue: st.conversionValue,
            date: st.date,
        }));

        console.log(`[API/Health] Running pre-analysis with ${searchTermInputs.length} search term inputs`);

        // Run the pre-analysis
        const { healthBlock, ngramBlock, healthScore } = runPreAnalysis(
            campaigns,
            adGroups,
            keywords,
            ads,
            negatives,
            searchTermInputs,
            auctionInsights,
            deviceStats,
            assetPerformance,
            changeEvents,
            conversionActions,
            pmaxProducts
        );

        return NextResponse.json({
            healthScore,
            // We also return the raw N-grams for the UI to visualize (not just the block)
            ngrams: searchTermInputs.length > 0 ? true : false,
            // Since runPreAnalysis returns a formatted block, we might want the raw data for a better UI
            // But for now, we'll return the whole report
            summary: healthScore.summary,
            overallScore: healthScore.overallScore,
            overallGrade: healthScore.overallGrade,
            checks: healthScore.checks,
            // N-Gram details will be calculated on the client or returned as raw if needed
            searchTerms: searchTermInputs
        });

    } catch (error: any) {
        const errorMessage = error?.message || "Unknown error";
        const errorStack = error?.stack || "";
        const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);

        console.error("Health API Error:", errorMessage);
        console.error("Error Stack:", errorStack);
        console.error("Error Details:", errorDetails);

        return NextResponse.json({
            error: "Failed to fetch health metrics",
            message: errorMessage,
            details: errorDetails
        }, { status: 500 });
    }
}
