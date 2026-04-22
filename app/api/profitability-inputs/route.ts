import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
    getProfitabilityInputs,
    saveProfitabilityInputs,
    ProfitabilityInputsRow,
} from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function rowToClient(row: ProfitabilityInputsRow) {
    return {
        customerId: row.customer_id,
        currency: row.currency,
        avgOrderValue: row.avg_order_value,
        cogsPercent: row.cogs_percent,
        cm1Percent: row.cm1_percent,
        cm2Percent: row.cm2_percent,
        cm3Percent: row.cm3_percent,
        targetLtv: row.target_ltv,
        targetCac: row.target_cac,
        blendedMer: row.blended_mer,
        breakEvenRoas: row.break_even_roas,
        notes: row.notes,
        updatedAt: row.updated_at,
    };
}

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) {
        return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
    }

    const row = await getProfitabilityInputs(customerId);
    if (!row) {
        return NextResponse.json({ inputs: null }, { status: 200 });
    }

    return NextResponse.json({ inputs: rowToClient(row) });
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if ((session.user as { role?: string }).role !== 'admin') {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const customerId: string | undefined = body.customerId;
    if (!customerId) {
        return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
    }

    const cogs = body.cogsPercent != null ? Number(body.cogsPercent) : null;
    const breakEvenRoas =
        body.breakEvenRoas != null
            ? Number(body.breakEvenRoas)
            : cogs != null && cogs > 0 && cogs < 100
                ? Number((1 / (1 - cogs / 100)).toFixed(2))
                : null;

    const payload = {
        customer_id: customerId,
        currency: body.currency ?? 'EUR',
        avg_order_value: body.avgOrderValue != null ? Number(body.avgOrderValue) : null,
        cogs_percent: cogs,
        cm1_percent: body.cm1Percent != null ? Number(body.cm1Percent) : null,
        cm2_percent: body.cm2Percent != null ? Number(body.cm2Percent) : null,
        cm3_percent: body.cm3Percent != null ? Number(body.cm3Percent) : null,
        target_ltv: body.targetLtv != null ? Number(body.targetLtv) : null,
        target_cac: body.targetCac != null ? Number(body.targetCac) : null,
        blended_mer: body.blendedMer != null ? Number(body.blendedMer) : null,
        break_even_roas: breakEvenRoas,
        notes: body.notes ?? null,
    };

    const result = await saveProfitabilityInputs(payload);
    if (!result.saved) {
        return NextResponse.json({ error: result.error || 'Save failed' }, { status: 500 });
    }

    const fresh = await getProfitabilityInputs(customerId);
    return NextResponse.json({ saved: true, inputs: fresh ? rowToClient(fresh) : null });
}
