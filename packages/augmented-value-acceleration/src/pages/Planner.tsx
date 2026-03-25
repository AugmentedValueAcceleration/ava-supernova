import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, cardStyle, chipStyle } from '../lib/theme';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  status: 'planned' | 'in_progress' | 'shipped' | 'deferred';
  priority: number;
  quarter: string | null;
  created_at: string;
}

interface ModelOption {
  id: string;
  name: string;
}

const MODELS: ModelOption[] = [
  { id: 'qwen-3.5-plus', name: 'Qwen 3.5 Plus' },
  { id: 'qwen-flash', name: 'Qwen Flash' },
];

const STRATEGIST_PROMPT = `You are Ava — The Strategist. You help plan features, roadmaps, and business strategy for Ava | Supernova.

Your approach:
- Ask "why" before "how" — understand the goal before proposing solutions
- Break big ideas into actionable phases
- Challenge assumptions constructively
- Reference past decisions from memory
- Never start building without a plan

You have access to tools: memory (recall past decisions), web search (research competitors/markets), codebase access (understand what exists), document creation (write PRDs/specs), and roadmap management.

When creating plans or documents, save them to the Library so they're accessible across the platform.

Current context:
- Product: Ava | Supernova — open-source AI coding agent
- VS Code installs: 1,327+
- Plans launch: April 13th at v1.0.0
- User: Stewart Vincent, Founder`;

const QUICK_PROMPTS = [
  { label: 'Plan a feature', prompt: 'Help me plan a new feature for Ava | Supernova.' },
  { label: 'Review roadmap', prompt: 'Review the current roadmap and suggest priorities.' },
  { label: 'Sprint planning', prompt: 'Let\'s plan the next sprint based on open roadmap items.' },
  { label: 'What shipped?', prompt: 'Show me what items have shipped recently.' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planned: { bg: theme.blueBg, text: theme.blue },
  in_progress: { bg: theme.yellowBg, text: theme.yellow },
  shipped: { bg: theme.greenBg, text: theme.green },
  deferred: { bg: 'rgba(107, 114, 128, 0.15)', text: theme.textSecondary },
};

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API || 'https://ava-supernova.com';
const LS_MODEL_KEY = 'ava-platform-planner-model';

export default function Planner() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [roadmapLoading, setRoadmapLoading] = useState(true);
  const [roadmapDismissed, setRoadmapDismissed] = useState(false);
  const [model, setModelState] = useState<string>(() => {
    try { return localStorage.getItem(LS_MODEL_KEY) || 'qwen-3.5-plus'; } catch { return 'qwen-3.5-plus'; }
  });
  const [modelOpen, setModelOpen] = useState(false);
  const [memoryRecalled, setMemoryRecalled] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const setModel = (m: string) => {
    setModelState(m);
    try { localStorage.setItem(LS_MODEL_KEY, m); } catch { /* */ }
  };

  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

  useEffect(() => { loadRoadmap(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function loadRoadmap() {
    setRoadmapLoading(true);
    try {
      const { data } = await supabase.from('roadmap_items').select('*').order('priority', { ascending: true }).limit(50);
      setRoadmapItems(data || []);
    } catch { /* silent */ }
    setRoadmapLoading(false);
  }

  // Auto-recall memory on first message in a session
  async function recallMemory(): Promise<string> {
    if (memoryRecalled) return '';
    setMemoryRecalled(true);
    try {
      const res = await fetch(`${PLATFORM_API}/api/admin/planner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'memory_recall',
          query: 'business planning decisions strategy',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.memories && data.memories.length > 0) {
          return `\n\n[Recalled memories]\n${data.memories.map((m: { content: string }) => `- ${m.content}`).join('\n')}`;
        }
      }
    } catch { /* silent */ }
    return '';
  }

  async function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(''); setLoading(true);

    // Recall memory on first message
    let memoryContext = '';
    if (messages.length === 0) {
      memoryContext = await recallMemory();
    }

    // Build messages with system prompt
    const apiMessages: ChatMessage[] = [
      { role: 'system', content: STRATEGIST_PROMPT + memoryContext },
      ...newMessages.map(m => ({ role: m.role, content: m.content })),
    ];

    try {
      const res = await fetch(`${PLATFORM_API}/api/admin/planner`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages.map(m => ({ role: m.role, content: m.content })), model }),
      });
      if (!res.ok || !res.body) { setMessages([...newMessages, { role: 'assistant', content: 'Failed to get a response. Check your connection.' }]); setLoading(false); return; }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let assistantContent = '';
      setMessages([...newMessages, { role: 'assistant', content: '' }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6); if (raw === '[DONE]') continue;
            try { const parsed = JSON.parse(raw); const delta = parsed.choices?.[0]?.delta?.content || parsed.content || '';
              if (delta) { assistantContent += delta; setMessages([...newMessages, { role: 'assistant', content: assistantContent }]); }
            } catch { /* skip */ }
          }
        }
      }
      if (!assistantContent) { setMessages([...newMessages, { role: 'assistant', content: 'No response received.' }]); }
    } catch { setMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please try again.' }]); }
    setLoading(false); loadRoadmap();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // Auto-show roadmap when items exist, auto-hide when empty — unless manually dismissed
  const showRoadmap = !roadmapDismissed && roadmapItems.length > 0;

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.pageBg, overflow: 'hidden' }}>
      {/* Chat panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '24px 32px 16px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <PageHeader title="Business Planning" subtitle="Plan features, roadmaps, and strategy with Ava — The Strategist." onRefresh={loadRoadmap} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {/* Model dropdown */}
            <div ref={modelRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setModelOpen(!modelOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${theme.border}`, background: 'transparent',
                  color: theme.textMuted, fontSize: 11, fontWeight: 300, cursor: 'pointer',
                }}
              >
                <span>{selectedModel.name}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  style={{ transform: modelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {modelOpen && (
                <div style={{
                  position: 'absolute', left: 0, top: '100%', marginTop: 4, width: 180,
                  background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 8,
                  boxShadow: '0 16px 32px rgba(0,0,0,0.5)', zIndex: 50, padding: '4px 0',
                }}>
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setModel(m.id); setModelOpen(false); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '6px 12px',
                        background: m.id === model ? theme.accentBg : 'transparent',
                        color: m.id === model ? theme.text : theme.textSecondary,
                        fontSize: 12, fontWeight: 300, border: 'none', cursor: 'pointer',
                      }}
                    >{m.name}</button>
                  ))}
                </div>
              )}
            </div>
            {QUICK_PROMPTS.map((qp) => (
              <button key={qp.label} onClick={() => sendMessage(qp.prompt)} disabled={loading} style={{
                background: theme.cardBg, border: 'none', borderRadius: 9999,
                padding: '6px 14px', fontSize: 12, fontWeight: 300, color: theme.textSecondary,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
              }}>{qp.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 80, color: theme.textMuted }}>
              <div style={{ fontSize: 14, fontWeight: 400, color: theme.textSecondary, marginBottom: 6 }}>The Strategist</div>
              <p style={{ fontSize: 13, fontWeight: 300, color: theme.textSecondary }}>Start planning with Ava</p>
              <p style={{ fontSize: 13, fontWeight: 300, marginTop: 6, color: theme.textMuted }}>Use a quick prompt or type a message below.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
              <div style={{
                maxWidth: '75%', padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 300, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: msg.role === 'user' ? theme.accent : theme.cardBg,
                color: msg.role === 'user' ? '#fff' : theme.text,
                border: msg.role === 'user' ? 'none' : `1px solid ${theme.border}`,
              }}>{msg.content || (loading && i === messages.length - 1 ? '...' : '')}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '12px 32px', borderTop: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..."
              rows={1} style={{
                flex: 1, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10,
                padding: '8px 12px', fontSize: 13, fontWeight: 300, color: theme.text, outline: 'none', resize: 'none',
                minHeight: 38, maxHeight: 100, fontFamily: 'inherit',
              }} />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{
              background: theme.accent, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 12, fontWeight: 300,
              cursor: !input.trim() || loading ? 'not-allowed' : 'pointer', opacity: !input.trim() || loading ? 0.4 : 1, flexShrink: 0,
            }}>{loading ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      </div>

      {/* Roadmap sidebar — auto-shows when items exist, auto-hides when empty */}
      {showRoadmap && (
        <div style={{ width: 340, borderLeft: `1px solid ${theme.border}`, overflowY: 'auto', flexShrink: 0, background: theme.surfaceBg }}>
          <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: 0 }}>Roadmap</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 300, color: theme.textMuted }}>{roadmapItems.length} items</span>
                <button
                  onClick={() => setRoadmapDismissed(true)}
                  title="Close roadmap panel"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted,
                    padding: 2, display: 'flex', alignItems: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {roadmapLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted, fontSize: 13, fontWeight: 300 }}>Loading...</div>
            ) : (
              roadmapItems.map((item) => {
                const sc = STATUS_COLORS[item.status] || STATUS_COLORS.planned;
                return (
                  <div key={item.id} style={{ ...cardStyle, padding: '12px 14px', marginBottom: 8, borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={chipStyle(sc.bg, sc.text)}>{item.status.replace('_', ' ')}</span>
                      {item.quarter && <span style={{ fontSize: 10, fontWeight: 300, color: theme.textMuted }}>{item.quarter}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 400, color: theme.text }}>{item.title}</div>
                    {item.description && (
                      <div style={{ fontSize: 11, fontWeight: 300, color: theme.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                        {item.description.length > 100 ? item.description.slice(0, 100) + '...' : item.description}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
