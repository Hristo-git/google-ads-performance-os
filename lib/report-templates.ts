import { ReportTemplate, ReportTemplateId } from '@/types/google-ads';

export const REPORT_TEMPLATE_DEFINITIONS: ReportTemplate[] = [
    {
        id: 'quality_score_diagnostics',
        nameEN: 'Quality Score Diagnostics',
        nameBG: 'Диагностика на Quality Score',
        descriptionEN: 'Identify low QS keywords and get actionable fixes to improve Ad Rank and reduce Lost IS (Rank)',
        descriptionBG: 'Идентифицирай ключови думи с нисък QS и получи конкретни решения за подобряване на Ad Rank и намаляване на Lost IS (Rank)',
        icon: '🎯',
        category: 'quality',
        requiredData: ['keywords', 'adGroups']
    },
    {
        id: 'lost_is_analysis',
        nameEN: 'Lost Impression Share Analysis',
        nameBG: 'Анализ на загубен дял на импресиите',
        descriptionEN: 'Separate quality issues (rank) from scaling opportunities (budget) with specific action plans',
        descriptionBG: 'Раздели проблемите с качеството (rank) от възможностите за мащабиране (budget) със специфични action plans',
        icon: '📊',
        category: 'efficiency',
        requiredData: ['campaigns']
    },
    {
        id: 'search_terms_intelligence',
        nameEN: 'Search Terms Intelligence',
        nameBG: 'Анализ на търсените термини',
        descriptionEN: 'N-gram analysis, branded/non-branded insights, and negative keyword mining',
        descriptionBG: 'N-gram анализ, branded/non-branded прозрения и negative keyword препоръки',
        icon: '🔍',
        category: 'insights',
        requiredData: ['searchTerms']
    },
    {
        id: 'ad_strength_performance',
        nameEN: 'Ad Strength & Copy Performance',
        nameBG: 'Ad Strength и копи анализ',
        descriptionEN: 'RSA ad strength audit with specific copy improvements to boost CTR and conversions',
        descriptionBG: 'Одит на RSA ad strength с конкретни подобрения на копито за увеличаване на CTR и конверсии',
        icon: '✍️',
        category: 'quality',
        requiredData: ['adGroups', 'ads']
    },
    {
        id: 'budget_allocation_efficiency',
        nameEN: 'Budget Allocation Efficiency',
        nameBG: 'Ефективност на бюджета',
        descriptionEN: 'Strategic spend breakdown analysis with budget reallocation scenarios',
        descriptionBG: 'Стратегически анализ на разходите със сценарии за преразпределение на бюджета',
        icon: '💰',
        category: 'efficiency',
        requiredData: ['campaigns']
    },
    {
        id: 'campaign_structure_health',
        nameEN: 'Campaign Structure Health Check',
        nameBG: 'Одит на структурата',
        descriptionEN: 'Audit campaign/ad group structure for efficiency, identify over-fragmentation and consolidation opportunities',
        descriptionBG: 'Одит на структурата на кампании/ad groups за ефективност, идентифициране на свръх-фрагментация и възможности за консолидация',
        icon: '🏗️',
        category: 'structure',
        requiredData: ['campaigns', 'adGroups', 'keywords']
    },
    {
        id: 'change_impact_analysis',
        nameEN: 'Change Impact Analysis',
        nameBG: 'Анализ на въздействието',
        descriptionEN: 'Quantify the impact of recent changes, separate actual impact from seasonality',
        descriptionBG: 'Количествен анализ на последните промени, разделяне на действителното въздействие от сезонност',
        icon: '📈',
        category: 'insights',
        requiredData: ['campaigns']
    },
    {
        id: 'creative_ad_audit',
        nameEN: 'Creative Ad Audit & Optimizer',
        nameBG: 'Креативен одит и оптимизация',
        descriptionEN: 'Comprehensive D2C creative + profitability audit with 3-5 rewrite variations using proven frameworks (PAS, BAB, Social Proof, Myth Breaker, Future State)',
        descriptionBG: 'Цялостен D2C креативен + profitability одит с 3-5 пренаписани варианта по доказани frameworks (PAS, BAB, Social Proof, Myth Breaker, Future State)',
        icon: '🎨',
        category: 'quality',
        requiredData: ['adGroups', 'ads', 'campaigns', 'creativeAssets', 'profitabilityInputs']
    }
];

// Helper to get template by ID
export function getTemplateById(id: ReportTemplateId): ReportTemplate | undefined {
    return REPORT_TEMPLATE_DEFINITIONS.find(t => t.id === id);
}

// Helper to get templates by category
export function getTemplatesByCategory(category: string): ReportTemplate[] {
    return REPORT_TEMPLATE_DEFINITIONS.filter(t => t.category === category);
}
