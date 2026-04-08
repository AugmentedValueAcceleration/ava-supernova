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
  const sections = [
    { title: 'Getting Started', desc: 'Install, configure, and start using Ava', icon: '🚀', url: 'https://ava-supernova.com/docs/getting-started' },
    { title: 'Modes', desc: 'Work, Plan, Chat, Teach, Security, Brainstorm', icon: '🎯', url: 'https://ava-supernova.com/docs/modes' },
    { title: 'Tools', desc: 'All available tools and how to use them', icon: '🔧', url: 'https://ava-supernova.com/docs/tools' },
    { title: 'Memory', desc: 'How Ava remembers and learns from you', icon: '🧠', url: 'https://ava-supernova.com/docs/memory' },
    { title: 'Creative Studio', desc: 'Generate images, music, voice, and video', icon: '🎨', url: 'https://ava-supernova.com/docs/creative-studio' },
    { title: 'BYOK', desc: 'Bring your own API keys from any provider', icon: '🔑', url: 'https://ava-supernova.com/docs/byok' },
    { title: 'API Reference', desc: 'Platform API for integrations', icon: '📡', url: 'https://ava-supernova.com/docs/api' },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">Browse documentation or open on the web</p>
      <div className="grid grid-cols-2 gap-3">
        {sections.map(s => (
          <button key={s.title} onClick={() => post({ type: 'open_url', url: s.url })}
            className="flex items-start gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left cursor-pointer hover:border-[var(--accent)]/30 transition">
            <span className="text-xl mt-0.5">{s.icon}</span>
            <div>
              <p className="text-sm font-medium text-white">{s.title}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{s.desc}</p>
            </div>
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
