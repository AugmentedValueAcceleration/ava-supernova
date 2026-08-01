import { useState } from 'react';
import { post } from '../App';
import { t, useLocale } from '../i18n';
import { SupportChat } from './SupportChat';
import { Releases } from './Releases';
import { Roadmap } from './Roadmap';
import { DocumentationPage } from './DocumentationPage';
import type { ReleaseNote, RoadmapTheme } from '../types/messages';

type HelpTab = 'support' | 'docs' | 'releases' | 'roadmap';

interface HelpPageProps {
  releases: ReleaseNote[];
  mode: 'platform' | 'byok';
  supportConversations: any[];
  supportMessages: any[];
  activeConversationId: string | null;
  supportLoading: boolean;
  supportUnread: number;
  roadmapThemes: RoadmapTheme[];
  roadmapLoading: boolean;
}

function getHelpTabs(): { key: HelpTab; label: string }[] {
  return [
    { key: 'support', label: t('dash.help.tab_support') },
    { key: 'docs', label: t('dash.library.docs') },
    { key: 'releases', label: t('dash.help.tab_releases') },
    { key: 'roadmap', label: t('dash.help.tab_roadmap') },
  ];
}

export function HelpPage({ releases, mode, supportConversations, supportMessages, activeConversationId, supportLoading, supportUnread, roadmapThemes, roadmapLoading }: HelpPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<HelpTab>('support');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('help.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">{t('help.subtitle')}</p>
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
            {key === 'support' && supportUnread > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
                {supportUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'support' && (
        <SupportChat
          conversations={supportConversations}
          activeMessages={supportMessages}
          activeConversationId={activeConversationId}
          loading={supportLoading}
          mode={mode}
        />
      )}

      {activeTab === 'docs' && <DocumentationPage />}

      {activeTab === 'releases' && (
        <Releases releases={releases} />
      )}

      {activeTab === 'roadmap' && (
        <Roadmap themes={roadmapThemes} loading={roadmapLoading} />
      )}

      {/* Legal & policies — a single quiet strip at the bottom of every Help
          tab so the user can always reach Terms, Privacy, and the Health
          safety policy without hunting. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border-card)] pt-3 text-[11px] text-[var(--text-muted)]">
        <button
          type="button"
          onClick={() => post({ type: 'open_url', url: 'https://avasupernova.com/terms' })}
          className="cursor-pointer border-none bg-transparent p-0 transition hover:text-[var(--text-secondary)]"
        >
          {t('dash.support.terms')}
        </button>
        <span className="opacity-40">·</span>
        <button
          type="button"
          onClick={() => post({ type: 'open_url', url: 'https://avasupernova.com/privacy' })}
          className="cursor-pointer border-none bg-transparent p-0 transition hover:text-[var(--text-secondary)]"
        >
          {t('dash.support.privacy')}
        </button>
        <span className="opacity-40">·</span>
        <button
          type="button"
          onClick={() => post({ type: 'open_url', url: 'https://avasupernova.com/health/safety' })}
          className="cursor-pointer border-none bg-transparent p-0 transition hover:text-[var(--text-secondary)]"
        >
          {t('help.health_safety')}
        </button>
      </div>
    </div>
  );
}
