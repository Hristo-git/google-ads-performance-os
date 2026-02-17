import { create } from 'zustand';
import { ReportTemplateId, ReportSettings, GeneratedReport } from '@/types/google-ads';

export interface ActiveReportState {
    templateId: ReportTemplateId;
    templateName: string;
    generating: boolean;
    phase: 'data' | 'ai' | null;
    status: string | null;
    currentReport: GeneratedReport | null;
    error: string | null;
    abortController: AbortController | null;
}

interface ReportStore {
    activeReport: ActiveReportState | null;
    notification: {
        id: string;
        title: string;
        timestamp: string;
        templateId: ReportTemplateId;
        isRead: boolean;
    } | null;

    // Actions
    startReport: (templateId: ReportTemplateId, templateName: string, controller: AbortController) => void;
    updateProgress: (updates: Partial<ActiveReportState>) => void;
    completeReport: (report: GeneratedReport) => void;
    failReport: (error: string) => void;
    clearActiveReport: () => void;
    clearNotification: () => void;
}

export const useReportStore = create<ReportStore>((set) => ({
    activeReport: null,
    notification: null,

    startReport: (templateId, templateName, controller) => set({
        activeReport: {
            templateId,
            templateName,
            generating: true,
            phase: 'data',
            status: 'Preparing data...',
            currentReport: null,
            error: null,
            abortController: controller,
        }
    }),

    updateProgress: (updates) => set((state) => ({
        activeReport: state.activeReport ? { ...state.activeReport, ...updates } : null
    })),

    completeReport: (report) => set((state) => ({
        activeReport: state.activeReport ? { ...state.activeReport, currentReport: report, generating: false, phase: null, status: null } : null,
        notification: {
            id: report.id,
            title: report.templateName,
            timestamp: new Date().toISOString(),
            templateId: report.templateId,
            isRead: false,
        }
    })),

    failReport: (error) => set((state) => ({
        activeReport: state.activeReport ? { ...state.activeReport, error, generating: false, phase: null, status: null } : null
    })),

    clearActiveReport: () => set({ activeReport: null }),
    clearNotification: () => set({ notification: null }),
}));
