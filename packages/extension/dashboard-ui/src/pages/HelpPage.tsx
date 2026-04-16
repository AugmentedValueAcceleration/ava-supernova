import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { SupportChat } from './SupportChat';
import { Releases } from './Releases';
import { Roadmap } from './Roadmap';
import type { ReleaseNote } from '../types/messages';

type HelpTab = 'support' | 'docs' | 'releases' | 'roadmap';

interface HelpPageProps {
  releases: ReleaseNote[];
  mode: 'platform' | 'byok';
  supportConversations: any[];
  supportMessages: any[];
  activeConversationId: string | null;
  supportLoading: boolean;
  supportUnread: number;
}

function getHelpTabs(): { key: HelpTab; label: string }[] {
  return [
    { key: 'support', label: t('dash.help.tab_support') },
    { key: 'docs', label: 'Docs' },
    { key: 'releases', label: t('dash.help.tab_releases') },
    { key: 'roadmap', label: t('dash.help.tab_roadmap') },
  ];
}

function DocsPage() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">Full reference for modes, tools, permissions, models, and more.</p>
      <button
        onClick={() => post({ type: 'open_docs' })}
        className="flex items-center gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-4 text-left cursor-pointer hover:bg-[var(--accent)]/10 transition w-full"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--accent)] shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-white">Open Documentation</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">63 tools, 6 modes, permission system, models, memory, and configuration — all in one searchable reference.</p>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        {[
          { title: 'How Ava Works', desc: 'Plain-English guide for new users', action: () => post({ type: 'open_url', url: 'https://ava-supernova.com/how-ava-works' }) },
          { title: 'Modes', desc: 'Work, Plan, Chat, Teach, Security, Brainstorm', action: () => post({ type: 'open_url', url: 'https://ava-supernova.com/modes' }) },
          { title: 'Tools Catalogue', desc: 'All 63 tools with descriptions', action: () => post({ type: 'open_url', url: 'https://ava-supernova.com/tools' }) },
          { title: 'Help & FAQ', desc: 'Common questions, quick answers', action: () => post({ type: 'open_url', url: 'https://ava-supernova.com/help' }) },
        ].map(s => (
          <button key={s.title} onClick={s.action}
            className="flex flex-col rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left cursor-pointer hover:border-[var(--accent)]/30 transition">
            <p className="text-sm font-medium text-white">{s.title}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">{s.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function HelpPage({ releases, mode, supportConversations, supportMessages, activeConversationId, supportLoading, supportUnread }: HelpPageProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<HelpTab>('support');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-light text-white">Help</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Support, documentation, release notes, and roadmap</p>
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

      {activeTab === 'docs' && <DocsPage />}

      {activeTab === 'releases' && (
        <Releases releases={releases} />
      )}

      {activeTab === 'roadmap' && (
        <Roadmap />
      )}
    </div>
  );
}
