import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { REPORT_TEMPLATES } from "@/lib/prompts";
import { upsertReport } from "@/lib/pinecone";
import { logActivity } from "@/lib/activity-logger";
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

        // Build prompt using template (no RAG — each report is a clean snapshot of the period)
        const promptBuilder = REPORT_TEMPLATES[templateId];
        let prompt = customPrompt || promptBuilder(data, settings.language);

        // Inject context signals (device/geo/hour/day/auction/LP/conversion actions + PMax)
        const contextBlock = data.contextBlock || '';
        const pmaxBlock = data.pmaxBlock || '';
        if (contextBlock || pmaxBlock) {
            const contextInjection = [contextBlock, pmaxBlock].filter(Boolean).join('\n\n');
            if (prompt.includes('=== ANALYSIS REQUIREMENTS ===')) {
                prompt = prompt.replace('=== ANALYSIS REQUIREMENTS ===', `${contextInjection}\n\n=== ANALYSIS REQUIREMENTS ===`);
            } else {
                prompt = `${prompt}\n\n${contextInjection}`;
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
                            max_tokens: 8192,
                            system: languageConstraint,
                            messages: [{ role: "user", content: prompt }],
                        });

                        for await (const event of pass1Stream) {
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                analysis += event.delta.text;
                            }
                        }

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
1. **Evaluate** the quality of this analysis:
   - Are recommendations specific enough?
   - Are there any missing insights?
   - Is the prioritization logical?

2. **Enhance** the analysis:
   - Add depth where it's surface-level
   - Provide more specific numbers/examples
   - Sharpen recommendations

3. **Rewrite** the final output as an improved version.

Output the enhanced analysis in the same structure and format, but with deeper insights and more actionable recommendations.`
                            : `Ти си senior performance marketing експерт, преглеждащ следния AI-генериран анализ.

${languageConstraint}

=== ОРИГИНАЛЕН АНАЛИЗ ===
${analysis}

=== ТВОЯТА ЗАДАЧА ===
1. **Оцени** качеството на този анализ:
   - Достатъчно ли специфични са препоръките?
   - Липсват ли важни прозрения?
   - Логична ли е приоритизацията?

2. **Подобри** анализа:
   - Добави дълбочина там, където е повърхностен
   - Предостави по-конкретни числа/примери
   - Изостри препоръките

3. **Препиши** финалния output като подобрена версия.

Изведи подобрения анализ в същата структура и формат, но с по-дълбоки прозрения и по-action-able препоръки.`;

                        analysis = ''; // Reset — pass 2 output replaces pass 1
                        const pass2Stream = anthropic.messages.stream({
                            model: modelId,
                            max_tokens: 8192,
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
                            max_tokens: 8192,
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

                    controller.close();

                    // Post-stream: store in Pinecone + log (fire-and-forget)
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

                        if (session?.user?.id) {
                            await logActivity(session.user.id, 'AI_ANALYSIS', {
                                level: 'report',
                                templateId,
                                context: contextLabel,
                                model: modelLabel,
                                expertMode: settings.expertMode,
                                responseLength: analysis?.length || 0
                            });
                        }

                        await upsertReport(reportId, analysis, {
                            templateId,
                            audience: settings.audience,
                            language: settings.language,
                            customerId: data.customerId || 'unknown',
                            reportTitle,
                        });
                    } catch (storeError) {
                        console.error("Failed to store report in Pinecone:", storeError);
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
