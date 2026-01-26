import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getAccountInfo } from "@/lib/google-ads";

// Mock account data for demonstration
const mockAccount = {
    id: "3151945525",
    name: "Demo Google Ads Account",
    currency: "USD",
    timezone: "Europe/Sofia",
};

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.refreshToken) {
            return NextResponse.json(
                { error: "Unauthorized - Please sign in" },
                { status: 401 }
            );
        }

        try {
            const account = await getAccountInfo(session.refreshToken);

            if (!account) {
                // Return mock data if no account found
                return NextResponse.json({ account: mockAccount, _mock: true });
            }

            return NextResponse.json({ account });
        } catch (apiError) {
            console.error("Google Ads API error, using mock data:", apiError);
            // Return mock data when API fails
            return NextResponse.json({ account: mockAccount, _mock: true });
        }
    } catch (error) {
        console.error("Error fetching account info:", error);
        return NextResponse.json(
            { error: "Failed to fetch account info" },
            { status: 500 }
        );
    }
}
