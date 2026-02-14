import { getAccountAuctionInsights, DateRange } from "@/lib/google-ads";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { customerId, dateRange, campaignIds } = body;

        if (!customerId) {
            return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
        }

        // Pass the refresh token from the session
        const refreshToken = (session.user as any).refreshToken;
        if (!refreshToken) {
            return NextResponse.json({ error: "Missing refresh token" }, { status: 401 });
        }

        const data = await getAccountAuctionInsights(
            refreshToken,
            customerId,
            dateRange as { start: string; end: string }, // function expects {start, end} not DateRange which might be different interface
            campaignIds
        );

        return NextResponse.json({ data });

    } catch (error: unknown) {
        console.error("Auction Insights API Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}
