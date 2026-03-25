import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, primaryBtnStyle, chipStyle, cardStyle } from '../lib/theme';

interface ChatMessage {
  role: 'user' | 'assistant';
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

export default function Planner() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [roadmapLoading, setRoadmapLoading] = useState(true);
  const [showRoadmap, setShowRoadmap] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadRoadmap(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadRoadmap() {
    setRoadmapLoading(true);
    try {
      const { data } = await supabase.from('roadmap_items').select('*').order('priority', { ascending: true }).limit(50);
      setRoadmapItems(data || []);
    } catch { /* silent */ }
    setRoadmapLoading(false);
  }

  async function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(''); setLoading(true);

    try {
      const res = await fetch(`${PLATFORM_API}/api/admin/planner`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })), model: 'glm-5' }),
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

  return (
    <div style={{ display: 'flex', height: '100%', background: theme.pageBg, overflow: 'hidden' }}>
      {/* Chat panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '24px 32px 16px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <PageHeader title="Planner" subtitle="Plan features and manage the roadmap with Ava." onRefresh={loadRoadmap}>
            <button onClick={() => setShowRoadmap(!showRoadmap)} style={{
              background: showRoadmap ? theme.accentBg : 'transparent',
              border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 14px',
              fontSize: 12, fontWeight: 500, color: showRoadmap ? theme.accent : theme.textSecondary, cursor: 'pointer',
            }}>{showRoadmap ? 'Hide Roadmap' : 'Show Roadmap'}</button>
          </PageHeader>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {QUICK_PROMPTS.map((qp) => (
              <button key={qp.label} onClick={() => sendMessage(qp.prompt)} disabled={loading} style={{
                background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 8,
                padding: '6px 12px', fontSize: 11, color: theme.textSecondary,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
              }}>{qp.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 80, color: theme.textMuted }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>&#128466;</div>
              <p style={{ fontSize: 15, fontWeight: 500, color: theme.textSecondary }}>Start planning with Ava</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Use a quick prompt or type a message below.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
              <div style={{
                maxWidth: '75%', padding: '12px 16px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: msg.role === 'user' ? theme.accent : theme.cardBg,
                color: msg.role === 'user' ? '#fff' : theme.text,
                border: msg.role === 'user' ? 'none' : `1px solid ${theme.border}`,
              }}>{msg.content || (loading && i === messages.length - 1 ? '...' : '')}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '16px 32px', borderTop: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..."
              rows={1} style={{
                flex: 1, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10,
                padding: '12px 16px', fontSize: 13, color: theme.text, outline: 'none', resize: 'none',
                minHeight: 44, maxHeight: 120, fontFamily: 'inherit',
              }} />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{
              ...primaryBtnStyle, borderRadius: 10, padding: '12px 20px',
              cursor: !input.trim() || loading ? 'not-allowed' : 'pointer', opacity: !input.trim() || loading ? 0.5 : 1, flexShrink: 0,
            }}>{loading ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      </div>

      {/* Roadmap sidebar */}
      {showRoadmap && (
        <div style={{ width: 340, borderLeft: `1px solid ${theme.border}`, overflowY: 'auto', flexShrink: 0, background: theme.surfaceBg }}>
          <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: 0 }}>Roadmap</h2>
              <span style={{ fontSize: 11, color: theme.textMuted }}>{roadmapItems.length} items</span>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {roadmapLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted, fontSize: 13 }}>Loading...</div>
            ) : roadmapItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted, fontSize: 13 }}>No roadmap items yet.</div>
            ) : (
              roadmapItems.map((item) => {
                const sc = STATUS_COLORS[item.status] || STATUS_COLORS.planned;
                return (
                  <div key={item.id} style={{ ...cardStyle, padding: '12px 14px', marginBottom: 8, borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={chipStyle(sc.bg, sc.text)}>{item.status.replace('_', ' ')}</span>
                      {item.quarter && <span style={{ fontSize: 10, color: theme.textMuted }}>{item.quarter}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>{item.title}</div>
                    {item.description && (
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, lineHeight: 1.4 }}>
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
