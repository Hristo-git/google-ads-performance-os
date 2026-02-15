import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { REPORT_TEMPLATES } from "@/lib/prompts";
import { saveReport, GadsReport } from "@/lib/supabase";
import { upsertReport } from "@/lib/pinecone"; // Keep for RAG/Vectors
import { logActivity } from "@/lib/activity-logger";
import { buildQualityScoreRequest, QSKeyword, QSAdGroup, QSComponent, mapKeyword, AD_LEVEL_URL_QUERY, validateQSData } from "@/lib/quality-score";
import { getQSSnapshotsForDate } from "@/lib/supabase";
import { KeywordWithQS, AdGroupPerformance, CampaignPerformance, runAdsRawQuery } from "@/lib/google-ads";
import { calculateDerivedMetrics, buildEnhancedDataInventory } from "@/lib/derived-metrics";
import type { ReportTemplateId, ReportSettings } from "@/types/google-ads";

// Streaming bypasses Vercel's time-to-first-byte timeout
export const maxDuration = 300;

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const requestData = await request.json();
        const {
            templateId,
            settings,
            data,
            customPrompt
        }: {
            templateId: ReportTemplateId;
            settings: ReportSettings;
            data: any;
            customPrompt?: string;
        } = requestData;

        // Validate template ID
        if (!REPORT_TEMPLATES[templateId]) {
            return NextResponse.json(
                { error: `Invalid template ID: ${templateId}` },
                { status: 400 }
            );
        }

        // Validate settings
        if (!settings.language || !settings.audience) {
            return NextResponse.json(
                { error: "Missing required settings: language, audience" },
                { status: 400 }
            );
        }

        const { language } = settings;
        const isEn = language === 'en';

        const languageConstraint = isEn
            ? "IMPORTANT: Your entire response MUST be in English."
            : "IMPORTANT: Your entire response MUST be in Bulgarian.";

        // Model selection (same whitelist as stream route)
        const ALLOWED_MODELS: Record<string, string> = {
            'opus-4.6': 'claude-opus-4-6',
            'sonnet-4.5': 'claude-sonnet-4-5-20250929',
            'haiku-4.5': 'claude-haiku-4-5-20251001',
        };
        const modelId = (settings.model && ALLOWED_MODELS[settings.model]) || 'claude-opus-4-6';
        const modelLabel = Object.entries(ALLOWED_MODELS).find(([, v]) => v === modelId)?.[0] || 'opus-4.6';

        console.log(`Generating report: ${templateId}, Model: ${modelLabel}, Language: ${language}, Expert Mode: ${settings.expertMode}`);

        // Sanitize campaign data — strip raw numeric bidding codes
        if (data.campaigns?.length) {
            const BIDDING_LABELS: Record<number | string, string> = {
                0: 'Unspecified', 1: 'Unknown', 2: 'Manual CPC', 3: 'Manual CPM',
                4: 'Manual CPV', 5: 'Maximize Conversions', 6: 'Maximize Conversion Value',
                7: 'Target CPA', 8: 'Target ROAS', 9: 'Target Impression Share',
                10: 'Manual CPC (Enhanced)', 11: 'Maximize Conversions',
                12: 'Maximize Conversion Value', 13: 'Target Spend',
            };
            data.campaigns = data.campaigns.map((c: any) => {
                if (c.biddingStrategyType !== undefined) {
                    const code = c.biddingStrategyType;
                    const label = (typeof code === 'string' && isNaN(Number(code)))
                        ? code
                        : BIDDING_LABELS[code] || BIDDING_LABELS[Number(code)] || 'Unknown Bidding Strategy';
                    const { biddingStrategyType: _raw, ...rest } = c;
                    return { ...rest, biddingStrategyType: label };
                }
                return c;
            });
        }

        // --- Quality Score Diagnostics Data Enrichment ---
        if (templateId === 'quality_score_diagnostics' && data.customerId) {
            try {
                // 1. Fetch Historical Snapshots (30 days ago)
                const today = new Date();
                const pastDate = new Date();
                pastDate.setDate(today.getDate() - 30);
                const snapshots = await getQSSnapshotsForDate(data.customerId, pastDate.toISOString().split('T')[0]);

                // 2. Fetch Ad-level URLs (Fallback) - Already handled in lib/google-ads.ts but kept for safety if needed
                const adUrlsRaw = await runAdsRawQuery(session.refreshToken as string, data.customerId, AD_LEVEL_URL_QUERY);
                const adLevelUrls = new Map<string, string>();
                adUrlsRaw.forEach(row => {
                    const agId = String(row.ad_group?.id);
                    const url = row.ad_group_ad?.ad?.final_urls?.[0];
                    if (agId && url) adLevelUrls.set(agId, url);
                });

                // 3. Fetch Keyword Counts per Ad Group (All Enabled)
                const kwCountsRaw = await runAdsRawQuery(session.refreshToken as string, data.customerId, `
                    SELECT ad_group.id, ad_group_criterion.criterion_id 
                    FROM ad_group_criterion 
                    WHERE ad_group_criterion.status = 'ENABLED' 
                    AND ad_group_criterion.negative = FALSE
                    AND ad_group_criterion.type = 'KEYWORD'
                `);
                const adGroupKwCount = new Map<string, number>();
                kwCountsRaw.forEach(row => {
                    const agId = String(row.ad_group.id);
                    adGroupKwCount.set(agId, (adGroupKwCount.get(agId) || 0) + 1);
                });

                // 4. Map Keywords to QSKeyword
                const adGroupMap = new Map<string, AdGroupPerformance>();
                if (Array.isArray(data.adGroups)) {
                    data.adGroups.forEach((ag: AdGroupPerformance) => adGroupMap.set(ag.id, ag));
                }

                const campaignMap = new Map<string, string>();
                if (Array.isArray(data.campaigns)) {
                    data.campaigns.forEach((c: CampaignPerformance) => campaignMap.set(c.id, c.name));
                }

                const qsKeywords: QSKeyword[] = (data.keywords || []).map((k: KeywordWithQS) => {
                    const ag = adGroupMap.get(k.adGroupId);
                    const history = snapshots.find(s => s.keyword_id === k.id);
                    const cName = k.campaignName || campaignMap.get(ag?.campaignId || '') || 'Unknown Campaign';

                    return {
                        campaignId: ag?.campaignId || '0',
                        campaignName: cName,
                        adGroupId: k.adGroupId,
                        adGroupName: k.adGroupName || ag?.name || 'Unknown Ad Group',
                        text: k.text,
                        matchType: k.matchType as 'EXACT' | 'PHRASE' | 'BROAD',
                        qualityScore: k.qualityScore || 0,
                        expectedCtr: k.expectedCtr as QSComponent,
                        adRelevance: k.adRelevance as QSComponent,
                        landingPageExperience: k.landingPageExperience as QSComponent,
                        impressions: k.impressions,
                        clicks: k.clicks,
                        cost: k.cost,
                        conversions: k.conversions,
                        conversionValue: k.conversionValue,
                        avgCpc: k.cpc,
                        biddingStrategyType: k.biddingStrategyType,
                        searchImpressionShare: undefined,
                        searchLostIsRank: undefined,
                        qualityScoreHistory: history ? {
                            previous: history.quality_score,
                            periodDaysAgo: 30
                        } : undefined,
                        finalUrl: k.finalUrl || adLevelUrls.get(k.adGroupId) || '',
                    };
                });

                // 5. Map Ad Groups to QSAdGroup
                const qsAdGroups: QSAdGroup[] = (data.adGroups || []).map((ag: AdGroupPerformance) => ({
                    campaignId: ag.campaignId,
                    campaignName: ag.campaignName || campaignMap.get(ag.campaignId) || 'Unknown',
                    adGroupId: ag.id,
                    name: ag.name,
                    avgQualityScore: ag.avgQualityScore || 0,
                    keywordCount: adGroupKwCount.get(ag.id) || 0,
                    keywordsWithLowQS: ag.keywordsWithLowQS,
                    impressions: ag.impressions,
                    clicks: ag.clicks,
                    cost: ag.cost,
                    conversionValue: ag.conversionValue,
                }));

                // 6. Build Structured Request
                const qsRequest = buildQualityScoreRequest(qsKeywords, qsAdGroups, {
                    dateRange: data.dateRange || { start: '2024-01-01', end: '2024-01-31' },
                    brandTokens: [],
                    language: settings.language,
                    audience: (settings.audience === 'client' ? 'stakeholder' : 'specialist'),
                    model: settings.model,
                    lowQsThreshold: 5,
                    topKeywordsBySpend: 50,
                });

                // Merge into data for the template
                Object.assign(data, qsRequest);

            } catch (error) {
                console.error('[Report/QS] Enrichment failed:', error);
            }
        }

        // Build prompt using template (no RAG — each report is a clean snapshot of the period)
        const promptBuilder = REPORT_TEMPLATES[templateId];
        let prompt = customPrompt || promptBuilder(data, settings.language);

        // Build enhanced data inventory + derived metrics
        const dataInventory = buildEnhancedDataInventory(data);
        const derivedMetrics = calculateDerivedMetrics(data.campaigns, data.adGroups, data.deviceData);

        // Inject context signals + data inventory + derived metrics
        const contextBlock = data.contextBlock || '';
        const pmaxBlock = data.pmaxBlock || '';
        const injections = [dataInventory, derivedMetrics, contextBlock, pmaxBlock].filter(Boolean).join('\n\n');
        if (injections) {
            if (prompt.includes('=== ANALYSIS REQUIREMENTS ===')) {
                prompt = prompt.replace('=== ANALYSIS REQUIREMENTS ===', `${injections}\n\n=== ANALYSIS REQUIREMENTS ===`);
            } else {
                prompt = `${prompt}\n\n${injections}`;
            }
        }

        // ── Streaming response ────────────────────────────────────────────
        // Streams chunks to the client as they arrive from Claude.
        // For Expert Mode (2-pass): streams pass 1 silently (accumulates),
        // then streams pass 2 to the client.
        // This bypasses Vercel's function timeout (10s free / 60s Pro).

        const encoder = new TextEncoder();

        const readable = new ReadableStream({
            async start(controller) {
                try {
                    let analysis = '';

                    if (settings.expertMode) {
                        // ── Two-pass Expert Mode ──
                        // Pass 1: accumulate silently, send progress indicator
                        controller.enqueue(encoder.encode(
                            isEn ? '> **Pass 1/2**: Generating initial analysis...\n\n'
                                : '> **Етап 1/2**: Генериране на първоначален анализ...\n\n'
                        ));

                        const pass1Stream = anthropic.messages.stream({
                            model: modelId,
                            max_tokens: 20000,
                            system: languageConstraint,
                            messages: [{ role: "user", content: prompt }],
                        });

                        // Keepalive: send a dot every 15s during silent pass 1
                        // so Vercel doesn't think the connection is stalled
                        const keepalive = setInterval(() => {
                            controller.enqueue(encoder.encode('.'));
                        }, 15_000);

                        for await (const event of pass1Stream) {
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                analysis += event.delta.text;
                            }
                        }

                        clearInterval(keepalive);
                        controller.enqueue(encoder.encode('\n\n'));

                        // Pass 2: stream refinement to client
                        controller.enqueue(encoder.encode(
                            isEn ? '> **Pass 2/2**: Expert refinement in progress...\n\n---\n\n'
                                : '> **Етап 2/2**: Експертна рефинация...\n\n---\n\n'
                        ));

                        const expertPrompt = isEn
                            ? `You are a senior performance marketing expert reviewing the following AI-generated analysis.

${languageConstraint}

=== ORIGINAL ANALYSIS ===
${analysis}

=== YOUR TASK ===
1. **Validate** — check for these specific errors:
   - Any "industry benchmark" or "typical ROAS" cited without a verifiable source? → REMOVE and replace with data verification steps
   - Any "estimated X conversions/revenue" without an explicit formula? → Either add the formula or remove the claim
   - Any device bid modifier recommendations for Smart Bidding campaigns (tCPA/tROAS/Maximize)? → Replace with valid alternatives (campaign segmentation, value rules, LP/UX improvements)
   - Any claim that data is "missing" or "unavailable" when it IS present in the input? → Correct immediately
   - Any "<X conversions per ad group" threshold applied to Smart Bidding? → Reframe to campaign-level learning
   - Any fabricated CPC/CVR/AOV values ("at €0.50 CPC" or "assuming 3% CVR")? → REMOVE entirely
   - Any dramatic language ("survival mode", "catastrophic", "alarming")? → Replace with neutral phrasing
   - Any anomaly (CVR>10%, ROAS>25x, device gap>3x) not flagged? → Add anomaly flag
   - Are pre-calculated derived metrics used instead of LLM math? → Ensure derived values are cited

2. **Enhance** the analysis:
   - Add depth where it's surface-level
   - Provide more specific numbers with formulas (show your math)
   - Sharpen recommendations — each must have: target, specific setting, KPI, guardrail
   - Ensure every projection is marked as "**Projection (model):** [formula] = [result]"
   - Add Confidence: HIGH/MEDIUM/LOW to each major recommendation

3. **Verify mandatory sections** are present:
   - Section 8: Scaling Scenarios (A/B/C) — REQUIRED for account/category reports
   - Section 9: Decision Requests (3-5 items)
   - Section 10: Definition of Done (4-6 measurable criteria)
   If any are missing, ADD them.

4. **Rewrite** the final output as an improved version.

Output the enhanced analysis directly — no meta-commentary, no "reviewer notes", no preamble about what was changed.`
                            : `Ти си senior performance marketing експерт, преглеждащ следния AI-генериран анализ.

${languageConstraint}

=== ОРИГИНАЛЕН АНАЛИЗ ===
${analysis}

=== ТВОЯТА ЗАДАЧА ===
1. **Валидирай** — провери за тези конкретни грешки:
   - Има ли "индустриални бенчмаркове" или "типичен ROAS" без верифицируем източник? → ПРЕМАХНИ и замени с стъпки за верификация на данните
   - Има ли "очаквани X конверсии/приходи" без формула? → Добави формулата или премахни твърдението
   - Има ли препоръки за device bid modifiers за Smart Bidding кампании (tCPA/tROAS/Maximize)? → Замени с валидни алтернативи (сегментация по device, value rules, LP/UX подобрения)
   - Има ли твърдения, че данни "липсват" или "не са налични", когато реално СА в input-а? → Коригирай веднага
   - Има ли "<X конверсии на ad group" праг, приложен към Smart Bidding? → Рефреймни към campaign-level learning
   - Има ли фабрикувани CPC/CVR/AOV стойности ("при €0.50 CPC" или "при 3% CVR")? → ПРЕМАХНИ изцяло
   - Има ли драматичен език ("режим на оцеляване", "катастрофален", "алармиращ")? → Замени с неутрална формулировка
   - Има ли аномалия (CVR>10%, ROAS>25x, device gap>3x), която не е маркирана? → Добави флаг за аномалия
   - Използвани ли са pre-calculated derived metrics вместо LLM математика? → Цитирай derived стойностите

2. **Подобри** анализа:
   - Добави дълбочина там, където е повърхностен
   - Предостави по-конкретни числа с формули (покажи математиката)
   - Изостри препоръките — всяка трябва да има: target, конкретна настройка, KPI, guardrail
   - Маркирай всяка прогноза като "**Прогноза (модел):** [формула] = [резултат]"
   - Добави Confidence: HIGH/MEDIUM/LOW към всяка основна препоръка

3. **Verify mandatory sections** are present:
   - Section 8: Scaling Scenarios (A/B/C) — REQUIRED for account/category reports
   - Section 9: Decision Requests (3-5 items)
   - Section 10: Definition of Done (4-6 measurable criteria)
   If any are missing, ADD them.

4. **Rewrite** the final output as an improved version.

Refine BOTH documents below. Return the complete refined version of DOCUMENT 1: EXECUTIVE SUMMARY and DOCUMENT 2: TECHNICAL ANALYSIS. Do not omit either document. Do not shorten or summarize — maintain full detail in both documents.

Izvedi podobreniq analiz direktno — bez meta-komentari, bez "belezhki na recenzent", bez predgovor.`;

                        analysis = ''; // Reset — pass 2 output replaces pass 1
                        const pass2Stream = anthropic.messages.stream({
                            model: modelId,
                            max_tokens: 20000,
                            system: languageConstraint,
                            messages: [{ role: "user", content: expertPrompt }],
                        });

                        for await (const event of pass2Stream) {
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                const chunk = event.delta.text;
                                analysis += chunk;
                                controller.enqueue(encoder.encode(chunk));
                            }
                        }
                    } else {
                        // ── Single pass: stream directly ──
                        const stream = anthropic.messages.stream({
                            model: modelId,
                            max_tokens: 20000,
                            system: languageConstraint,
                            messages: [{ role: "user", content: prompt }],
                        });

                        for await (const event of stream) {
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                const chunk = event.delta.text;
                                analysis += chunk;
                                controller.enqueue(encoder.encode(chunk));
                            }
                        }
                    }

                    // Persist to SQL BEFORE closing stream (Vercel may kill after close)
                    try {
                        const templateNames: Record<string, string> = {
                            quality_score_diagnostics: 'QS Diagnostics',
                            lost_is_analysis: 'Lost IS Analysis',
                            search_terms_intelligence: 'Search Terms',
                            ad_strength_performance: 'Ad Strength',
                            budget_allocation_efficiency: 'Budget Allocation',
                            campaign_structure_health: 'Structure Health',
                            change_impact_analysis: 'Change Impact',
                        };

                        let periodLabel = '';
                        if (data.dateRange) {
                            const startDate = data.dateRange.start || data.dateRange.startDate || data.dateRange.from;
                            const endDate = data.dateRange.end || data.dateRange.endDate || data.dateRange.to;
                            if (startDate && endDate) {
                                periodLabel = ` (${startDate} — ${endDate})`;
                            }
                        }

                        const contextLabel = templateNames[templateId] || templateId;
                        const reportTitle = `[${modelLabel}] ${contextLabel}${periodLabel}`;
                        const reportId = `${templateId}_${Date.now()}`;

                        // SQL save + log activity BEFORE close (fast, ~100ms)
                        await Promise.all([
                            session?.user?.id ? logActivity(session.user.id, 'AI_ANALYSIS', {
                                level: 'report',
                                templateId,
                                context: contextLabel,
                                model: modelLabel,
                                expertMode: settings.expertMode,
                                responseLength: analysis?.length || 0
                            }) : Promise.resolve(),
                            saveReport({
                                id: reportId,
                                customer_id: data.customerId || 'unknown',
                                template_id: templateId,
                                title: reportTitle,
                                analysis: analysis,
                                audience: settings.audience,
                                language: settings.language,
                                model: modelLabel,
                                metadata: { settings, periodLabel }
                            }),
                        ]);

                        // Close stream — user sees the result
                        controller.close();

                        // Pinecone upsert (slow, 30-60s) — fire-and-forget after close
                        upsertReport(reportId, analysis, {
                            templateId,
                            audience: settings.audience,
                            language: settings.language,
                            customerId: data.customerId || 'unknown',
                            reportTitle,
                        }).catch(err => console.error("Pinecone upsert failed (non-blocking):", err));
                    } catch (storeError) {
                        console.error("Failed to store report:", storeError);
                        controller.close();
                    }
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    controller.enqueue(encoder.encode(`\n\n[ERROR: ${errMsg}]`));
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error: any) {
        console.error("Report generation error:", error);

        return NextResponse.json(
            {
                error: error.message || "Failed to generate report",
                details: error.status ? `Status ${error.status}: ${JSON.stringify(error.error || {})}` : String(error)
            },
            { status: 500 }
        );
    }
}
