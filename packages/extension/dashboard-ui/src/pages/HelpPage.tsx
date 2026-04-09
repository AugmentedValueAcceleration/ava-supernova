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
  const [active, setActive] = useState('getting-started');

  const sections = [
    { id: 'getting-started', title: 'Getting Started', content: (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">Ava is an AI coding agent with 57 tools across 6 modes. Local-first — everything works without an account. Cloud sync is optional.</p>
        <div className="grid grid-cols-3 gap-3">
          {[{ step: '1', title: 'Install', desc: 'Install from the VS Code Marketplace or download the IDE.' },
            { step: '2', title: 'Configure', desc: 'Add your API keys (BYOK) or connect a platform account.' },
            { step: '3', title: 'Start Building', desc: 'Open a project, type a request, and Ava gets to work.' }].map(s => (
            <div key={s.step} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
              <div className="w-6 h-6 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-xs font-bold mb-2">{s.step}</div>
              <p className="text-xs font-semibold text-white">{s.title}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    )},
    { id: 'local-vs-cloud', title: 'Local vs Cloud', content: (
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-500/20 bg-[var(--bg-card)] p-4">
          <p className="text-sm font-semibold text-emerald-400 mb-2">Local Mode</p>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
            <li>Your data stays on your machine</li>
            <li>BYOK — use your own API keys</li>
            <li>No account required</li>
          </ul>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-[var(--bg-card)] p-4">
          <p className="text-sm font-semibold text-blue-400 mb-2">Cloud Mode</p>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
            <li>Sync across devices</li>
            <li>Managed models — no keys needed</li>
            <li>3M free tokens per month</li>
          </ul>
        </div>
      </div>
    )},
    { id: 'modes', title: '6 Modes', content: (
      <div className="grid grid-cols-2 gap-2">
        {[{ icon: '>>', name: 'Work', desc: 'Builder mindset — full tool access' },
          { icon: '::', name: 'Plan', desc: 'Architect mindset — read-only research' },
          { icon: '..', name: 'Chat', desc: 'Friend mindset — personal conversation' },
          { icon: '??', name: 'Teach', desc: 'Tutor mindset — Socratic learning' },
          { icon: '!!', name: 'Security', desc: 'Auditor mindset — OWASP scanning' },
          { icon: '**', name: 'Brainstorm', desc: 'Ideation mindset — grounded ideas' }].map(m => (
          <div key={m.name} className="flex items-center gap-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
            <span className="text-[var(--accent)] font-mono text-sm font-bold w-6">{m.icon}</span>
            <div>
              <p className="text-xs font-semibold text-white">{m.name}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>
    )},
    { id: 'tools', title: 'Tools (57)', content: (
      <div className="space-y-2">
        {[{ cat: 'File Ops', tools: 'file_read, file_write, file_edit, glob, grep, list_directory, find_symbol, project_index' },
          { cat: 'Shell', tools: 'bash, test_run, test_generate, benchmark, debug_logs' },
          { cat: 'Git', tools: 'git_status, git_diff, rollback, git_commit, git_create_pr' },
          { cat: 'Web', tools: 'web_search, http_request, browser, weather, news' },
          { cat: 'Media', tools: 'generate_image, generate_music, generate_video, generate_voice, remove_background' },
          { cat: 'Memory', tools: 'memory_save, memory_recall, memory_update, memory_delete' },
          { cat: 'Documents', tools: 'document_manage, presentation_create, email_draft, report_generate, doc_generate' },
          { cat: 'Learning', tools: 'learning_create, learning_teach, learning_progress' },
          { cat: 'System', tools: 'ask_user, support_request, propose_tool, self_inspect, get_datetime, detect_language' }].map(g => (
          <div key={g.cat} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2">
            <span className="text-[11px] font-semibold text-[var(--accent)]">{g.cat}: </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">{g.tools}</span>
          </div>
        ))}
      </div>
    )},
    { id: 'memory', title: 'Memory System', content: (
      <div className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">5-layer memory that learns from every conversation. Persists across sessions.</p>
        {['Extract — capture key facts from conversation',
          'Reflect — LLM-powered analysis of what was learned',
          'Accumulate — build patterns across sessions',
          'Analyse — surface insights and contradictions',
          'Consolidate — merge duplicates, prune stale entries'].map((l, i) => (
          <div key={i} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2">
            <span className="text-xs text-[var(--accent)] font-semibold">Layer {i + 1}: </span>
            <span className="text-xs text-[var(--text-muted)]">{l}</span>
          </div>
        ))}
      </div>
    )},
    { id: 'creative-studio', title: 'Creative Studio', content: (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">Generate images, music, voice, and video directly from the dashboard using MiniMax AI models.</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ icon: '🖼️', title: 'Images', desc: 'Text-to-image. Choose aspect ratio (1:1, 3:4, 4:3).' },
            { icon: '🎵', title: 'Audio', desc: 'Generate music with optional lyrics.' },
            { icon: '🎙️', title: 'Voice', desc: 'Text-to-speech with multiple voice styles.' },
            { icon: '🎬', title: 'Video', desc: 'Short videos from text prompts. 6 or 10 seconds.' }].map(s => (
            <div key={s.title} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
              <span className="text-lg">{s.icon}</span>
              <p className="text-xs font-semibold text-white mt-1">{s.title}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    )},
    { id: 'personas', title: 'Personas', content: (
      <div className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">24 specialist personas across 5 modes, orchestrated by a Conductor that routes tasks to the right specialist.</p>
        {[{ mode: 'Work', chain: 'Scout → Architect → Verifier → Sequencer → Challenger → Builder' },
          { mode: 'Plan', chain: 'Researcher → Architect → Challenger' },
          { mode: 'Teach', chain: 'Curriculum Architect → Content Writer → Fact Checker → Quiz Master → Tutor' },
          { mode: 'Security', chain: 'Recon → Scanner → CVE Researcher → Verifier → Reporter' },
          { mode: 'Brainstorm', chain: 'Explorer → Researcher → Ideator → Challenger → Refiner' }].map(p => (
          <div key={p.mode} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2">
            <span className="text-[11px] font-semibold text-[var(--accent)]">{p.mode}: </span>
            <span className="text-[11px] text-[var(--text-muted)]">{p.chain}</span>
          </div>
        ))}
        <p className="text-[10px] text-[var(--text-muted)]">Chat mode has no personas — just Ava being a friend.</p>
      </div>
    )},
    { id: 'local-cloud-sync', title: 'Data Sync', content: (
      <div className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">Your data, your choice. Everything saves locally by default. Push to cloud when you want cross-device access.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-500/20 bg-[var(--bg-card)] p-3">
            <p className="text-xs font-semibold text-emerald-400">Always Local</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Tasks, journal, memory, chat history, learning — all stored on your device.</p>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-[var(--bg-card)] p-3">
            <p className="text-xs font-semibold text-blue-400">Cloud Optional</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Connect an account to sync across IDE, extension, and companion app.</p>
          </div>
        </div>
      </div>
    )},
  ];

  return (
    <div className="flex gap-4" style={{ minHeight: 400 }}>
      {/* Sidebar nav */}
      <div className="w-44 shrink-0 space-y-0.5">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition ${
              active === s.id ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium' : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
            }`}>{s.title}</button>
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        {sections.find(s => s.id === active)?.content}
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
