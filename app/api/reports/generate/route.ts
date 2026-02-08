import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { REPORT_TEMPLATES } from "@/lib/prompts";
import { querySimilarReports, upsertReport } from "@/lib/pinecone";
import type { ReportTemplateId, ReportSettings } from "@/types/google-ads";

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

        console.log(`Generating report: ${templateId}, Language: ${language}, Expert Mode: ${settings.expertMode}`);

        // --- RAG: Retrieve past reports for context ---
        let historyContext = "";
        const currentCustomerId = data.customerId || undefined;
        try {
            const searchQuery = `${templateId} ${settings.audience} analysis`;
            const matches = await querySimilarReports(searchQuery, currentCustomerId, 2);

            if (matches && matches.length > 0) {
                const pastAnalyses = (matches as any[]).map((m: any, i: number) =>
                    `### PAST ANALYSIS ${i + 1} (${m.metadata?.timestamp || 'unknown date'})\n${m.metadata?.analysis_content || m.analysis_content || ''}`
                ).join('\n\n');

                historyContext = isEn
                    ? `\n\n=== SEMANTIC MEMORY: PREVIOUS ANALYSES ===\nBelow are relevant findings from previous reports. Use them to track progress, note if recommendations were followed, and ensure continuity.\n\n${pastAnalyses}`
                    : `\n\n=== СЕМАНТИЧНА ПАМЕТ: ПРЕДИШНИ АНАЛИЗИ ===\nПо-долу са подходящи констатации от предишни отчети. Използвайте ги, за да проследите прогреса, да отбележите дали препоръките са били спазени и да осигурите приемственост.\n\n${pastAnalyses}`;
            }
        } catch (ragError) {
            console.warn("RAG retrieval failed, proceeding without history:", ragError);
        }

        // Build prompt using template
        const promptBuilder = REPORT_TEMPLATES[templateId];
        let prompt = customPrompt || promptBuilder(data, settings.language);

        // Inject history if available
        if (historyContext) {
            prompt += historyContext;
        }

        // First pass: Generate initial analysis
        const firstPassResponse = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 4000,
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
                model: "claude-opus-4-6",
                max_tokens: 4000,
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
                const startDate = data.dateRange.startDate || data.dateRange.from;
                const endDate = data.dateRange.endDate || data.dateRange.to;
                if (startDate && endDate) {
                    periodLabel = ` (${startDate} — ${endDate})`;
                }
            }

            const reportTitle = `${templateNames[templateId] || templateId}${periodLabel}`;
            const reportId = `${templateId}_${Date.now()}`;

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
