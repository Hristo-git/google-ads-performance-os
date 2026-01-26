"use client";

import { Campaign, AdGroup, NavigationState } from "@/types/google-ads";
import { useState } from "react";

interface SidebarProps {
    campaigns: Campaign[];
    adGroups: AdGroup[];
    navigation: NavigationState;
    onNavigate: (nav: NavigationState) => void;
    accountName: string;
}

export default function Sidebar({
    campaigns,
    adGroups,
    navigation,
    onNavigate,
    accountName,
}: SidebarProps) {
    const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

    const toggleCampaign = (campaignId: string) => {
        const newExpanded = new Set(expandedCampaigns);
        if (newExpanded.has(campaignId)) {
            newExpanded.delete(campaignId);
        } else {
            newExpanded.add(campaignId);
        }
        setExpandedCampaigns(newExpanded);
    };

    const getAdGroupsForCampaign = (campaignId: string) => {
        return adGroups.filter(ag => ag.campaignId === campaignId);
    };

    const isSelected = (level: string, id?: string) => {
        if (level === 'account') return navigation.level === 'account';
        if (level === 'campaign') return navigation.level === 'campaign' && navigation.campaignId === id;
        if (level === 'adgroup') return navigation.level === 'adgroup' && navigation.adGroupId === id;
        return false;
    };

    return (
        <aside className="w-72 bg-slate-800 border-r border-slate-700 flex flex-col h-full">
            {/* Account Header */}
            <div className="p-4 border-b border-slate-700">
                <button
                    onClick={() => onNavigate({ level: 'account' })}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                        isSelected('account')
                            ? 'bg-violet-600 text-white'
                            : 'hover:bg-slate-700 text-slate-300'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide">Account</p>
                            <p className="font-medium truncate">{accountName || 'All Campaigns'}</p>
                        </div>
                    </div>
                </button>
            </div>

            {/* Campaign Tree */}
            <div className="flex-1 overflow-y-auto p-2">
                <div className="text-xs text-slate-500 uppercase tracking-wide px-3 py-2">
                    Campaigns ({campaigns.length})
                </div>

                <div className="space-y-1">
                    {campaigns.map((campaign) => {
                        const campaignAdGroups = getAdGroupsForCampaign(campaign.id);
                        const isExpanded = expandedCampaigns.has(campaign.id);
                        const isCampaignSelected = isSelected('campaign', campaign.id);

                        return (
                            <div key={campaign.id}>
                                {/* Campaign Row */}
                                <div className="flex items-center">
                                    <button
                                        onClick={() => toggleCampaign(campaign.id)}
                                        className="p-2 text-slate-400 hover:text-white transition-colors"
                                    >
                                        <svg
                                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            onNavigate({
                                                level: 'campaign',
                                                campaignId: campaign.id,
                                                campaignName: campaign.name,
                                            });
                                            if (!isExpanded) toggleCampaign(campaign.id);
                                        }}
                                        className={`flex-1 text-left px-2 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                                            isCampaignSelected
                                                ? 'bg-violet-600 text-white'
                                                : 'hover:bg-slate-700 text-slate-300'
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${
                                            campaign.status === 'ENABLED' ? 'bg-emerald-400' : 'bg-slate-500'
                                        }`} />
                                        <span className="truncate text-sm">{campaign.name}</span>
                                        <span className="ml-auto text-xs text-slate-500">
                                            {campaignAdGroups.length}
                                        </span>
                                    </button>
                                </div>

                                {/* Ad Groups */}
                                {isExpanded && (
                                    <div className="ml-8 space-y-1 mt-1">
                                        {campaignAdGroups.map((adGroup) => {
                                            const isAdGroupSelected = isSelected('adgroup', adGroup.id);
                                            return (
                                                <button
                                                    key={adGroup.id}
                                                    onClick={() => onNavigate({
                                                        level: 'adgroup',
                                                        campaignId: campaign.id,
                                                        campaignName: campaign.name,
                                                        adGroupId: adGroup.id,
                                                        adGroupName: adGroup.name,
                                                    })}
                                                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${
                                                        isAdGroupSelected
                                                            ? 'bg-violet-600/80 text-white'
                                                            : 'hover:bg-slate-700/50 text-slate-400'
                                                    }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                                        adGroup.status === 'ENABLED' ? 'bg-emerald-400' : 'bg-slate-500'
                                                    }`} />
                                                    <span className="truncate">{adGroup.name}</span>
                                                </button>
                                            );
                                        })}
                                        {campaignAdGroups.length === 0 && (
                                            <p className="text-xs text-slate-600 px-3 py-2">No ad groups</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer Stats */}
            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
                <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-slate-700/50 rounded-lg p-2">
                        <p className="text-lg font-bold text-white">{campaigns.length}</p>
                        <p className="text-xs text-slate-400">Campaigns</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-2">
                        <p className="text-lg font-bold text-white">{adGroups.length}</p>
                        <p className="text-xs text-slate-400">Ad Groups</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
