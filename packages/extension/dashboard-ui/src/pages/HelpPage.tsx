import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { Support } from './Support';
import { Releases } from './Releases';
import { Roadmap } from './Roadmap';
import type { SupportTicket, ReleaseNote } from '../types/messages';

type HelpTab = 'support' | 'releases' | 'roadmap';

interface HelpPageProps {
  tickets: SupportTicket[];
  ticketsLoading: boolean;
  releases: ReleaseNote[];
  mode: 'platform' | 'byok';
}

function getHelpTabs(): { key: HelpTab; label: string }[] {
  return [
    { key: 'support', label: t('dash.help.tab_support') },
    { key: 'releases', label: t('dash.help.tab_releases') },
    { key: 'roadmap', label: t('dash.help.tab_roadmap') },
  ];
}

export function HelpPage({ tickets, ticketsLoading, releases, mode }: HelpPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<HelpTab>('support');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white">Help</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Support, release notes, and product roadmap</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        {getHelpTabs().map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 pb-2 pt-1 text-xs font-medium transition ${
              activeTab === key
                ? 'border-b-2 border-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
            {key === 'support' && tickets.length > 0 && (
              <span className="ml-1 rounded-full bg-[var(--accent)]/15 px-1.5 text-[10px] text-[var(--accent)]">
                {tickets.filter(t => t.status === 'open').length || ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'support' && (
        <Support tickets={tickets} loading={ticketsLoading} mode={mode} />
      )}

      {activeTab === 'releases' && (
        <Releases releases={releases} />
      )}

      {activeTab === 'roadmap' && (
        <Roadmap />
      )}
    </div>
  );
}
