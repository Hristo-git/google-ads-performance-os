import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { REPORT_TEMPLATES } from "@/lib/prompts";
import { upsertReport } from "@/lib/pinecone";
import { logActivity } from "@/lib/activity-logger";
import type { ReportTemplateId, ReportSettings } from "@/types/google-ads";

// Allow up to 300s for 2-pass Claude analysis (requires Vercel Pro)
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
            // Insert before "=== ANALYSIS REQUIREMENTS ===" if present, otherwise append
            if (prompt.includes('=== ANALYSIS REQUIREMENTS ===')) {
                prompt = prompt.replace('=== ANALYSIS REQUIREMENTS ===', `${contextInjection}\n\n=== ANALYSIS REQUIREMENTS ===`);
            } else {
                prompt = `${prompt}\n\n${contextInjection}`;
            }
        }

        // First pass: Generate initial analysis
        const firstPassResponse = await anthropic.messages.create({
            model: modelId,
            max_tokens: 8192,
            system: languageConstraint,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        });

        let analysis = firstPassResponse.content[0].type === 'text' ? firstPassResponse.content[0].text : 'No text output';

        // Expert Mode: Two-pass analysis
        if (settings.expertMode) {
            console.log('Expert Mode enabled: Running second pass for refinement');

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

            const secondPassResponse = await anthropic.messages.create({
                model: modelId,
                max_tokens: 8192,
                system: languageConstraint,
                messages: [
                    {
                        role: "user",
                        content: expertPrompt
                    }
                ],
            });

            analysis = secondPassResponse.content[0].type === 'text' ? secondPassResponse.content[0].text : analysis;
        }

        // --- Store new analysis in Pinecone ---
        try {
            // Build descriptive title from template name and date range
            const templateNames: Record<string, string> = {
                quality_score_diagnostics: 'QS Diagnostics',
                lost_is_analysis: 'Lost IS Analysis',
                search_terms_intelligence: 'Search Terms',
                ad_strength_performance: 'Ad Strength',
                budget_allocation_efficiency: 'Budget Allocation',
                campaign_structure_health: 'Structure Health',
                change_impact_analysis: 'Change Impact',
            };

            // Format date range
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

            // Log activity
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

        return NextResponse.json({ analysis });
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
