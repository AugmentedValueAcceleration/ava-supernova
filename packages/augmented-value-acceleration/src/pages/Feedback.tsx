import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, statCardStyle, tableHeaderStyle, tableCellStyle, chipStyle } from '../lib/theme';

interface FeedbackEntry {
  id: string;
  user_id: string | null;
  message_id: string;
  conversation_id: string | null;
  rating: 'up' | 'down';
  reason: string | null;
  model: string | null;
  mode: string | null;
  created_at: string;
}

interface SharedLearning {
  id: string;
  type: string;
  category: string;
  context: string;
  learned: string;
  confidence: number;
  confirmations: number;
  created_at: string;
  updated_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Feedback() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [learnings, setLearnings] = useState<SharedLearning[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'negative' | 'learnings'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [fbRes, lRes] = await Promise.all([
        supabase.from('message_feedback').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('shared_learnings').select('*').order('confidence', { ascending: false }).limit(200),
      ]);
      setFeedback(fbRes.data || []);
      setLearnings(lRes.data || []);
    } catch {
      // silent
    }
    setLoading(false);
  }

  // Compute stats
  const totalUp = feedback.filter(f => f.rating === 'up').length;
  const totalDown = feedback.filter(f => f.rating === 'down').length;
  const total = feedback.length;
  const satisfactionPercent = total > 0 ? Math.round((totalUp / total) * 100) : 0;

  const negativeFeedback = feedback.filter(f => f.rating === 'down');

  // By mode
  const byMode: Record<string, { up: number; down: number }> = {};
  feedback.forEach(f => {
    const mode = f.mode || 'unknown';
    if (!byMode[mode]) byMode[mode] = { up: 0, down: 0 };
    if (f.rating === 'up') byMode[mode].up++;
    else byMode[mode].down++;
  });

  // By model
  const byModel: Record<string, { up: number; down: number }> = {};
  feedback.forEach(f => {
    const model = f.model || 'unknown';
    if (!byModel[model]) byModel[model] = { up: 0, down: 0 };
    if (f.rating === 'up') byModel[model].up++;
    else byModel[model].down++;
  });

  // Common complaints
  const complaintMap: Record<string, number> = {};
  negativeFeedback.forEach(f => {
    if (f.reason) {
      complaintMap[f.reason] = (complaintMap[f.reason] || 0) + 1;
    }
  });
  const complaints = Object.entries(complaintMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: theme.pageBg }}>
        <div style={{ fontSize: 14, color: theme.textMuted }}>Loading feedback data...</div>
      </div>
    );
  }

  const tabStyle = (isActive: boolean) => ({
    flex: 1,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#fff' : theme.textMuted,
    background: isActive ? theme.accent : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer' as const,
  });

  return (
    <div style={pageStyle}>

      <PageHeader title="Feedback & Self-Improvement" subtitle="Message ratings, satisfaction analytics, and Ava's shared learning pool." onRefresh={loadData} />

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 4, marginBottom: 24 }}>
        <button onClick={() => setTab('overview')} style={tabStyle(tab === 'overview')}>Overview</button>
        <button onClick={() => setTab('negative')} style={tabStyle(tab === 'negative')}>Negative Feedback</button>
        <button onClick={() => setTab('learnings')} style={tabStyle(tab === 'learnings')}>Shared Learnings</button>
      </div>

      {tab === 'overview' && (
        <div>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard label="Overall Satisfaction" value={`${satisfactionPercent}%`} sub={`${totalUp} positive / ${totalDown} negative`} accent={satisfactionPercent >= 70} />
            <StatCard label="Total Ratings" value={String(total)} sub={`${totalUp} up, ${totalDown} down`} />
            <StatCard label="Shared Learnings" value={String(learnings.length)} sub={`${learnings.filter(l => l.confidence >= 0.5).length} visible (>0.5 confidence)`} />
            <StatCard label="Top Complaint" value={complaints[0]?.reason || 'None'} sub={complaints[0] ? `${complaints[0].count} occurrences` : ''} />
          </div>

          {/* By mode & model */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={cardStyle}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, margin: '0 0 16px 0' }}>Satisfaction by Mode</h2>
              {Object.entries(byMode).map(([mode, counts]) => {
                const t = counts.up + counts.down;
                const pct = t > 0 ? Math.round((counts.up / t) * 100) : 0;
                return (
                  <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ width: 70, fontSize: 12, fontWeight: 500, color: theme.text, textTransform: 'capitalize' }}>{mode}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: theme.inputBg, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: theme.greenBg.replace('0.12', '0.5'), width: `${pct}%` }} />
                    </div>
                    <span style={{ width: 40, textAlign: 'right', fontSize: 10, color: theme.textMuted }}>{pct}%</span>
                  </div>
                );
              })}
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, margin: '0 0 16px 0' }}>Satisfaction by Model</h2>
              {Object.entries(byModel)
                .sort((a, b) => (b[1].up + b[1].down) - (a[1].up + a[1].down))
                .slice(0, 8)
                .map(([model, counts]) => {
                  const t = counts.up + counts.down;
                  const pct = t > 0 ? Math.round((counts.up / t) * 100) : 0;
                  const shortModel = model.includes(':') ? model.split(':').pop()! : model;
                  return (
                    <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ width: 100, fontSize: 12, fontWeight: 500, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={model}>{shortModel}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: theme.inputBg, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: theme.blueBg.replace('0.12', '0.5'), width: `${pct}%` }} />
                      </div>
                      <span style={{ width: 60, textAlign: 'right', fontSize: 10, color: theme.textMuted }}>{pct}% ({t})</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Common complaints */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, margin: '0 0 16px 0' }}>Common Complaints</h2>
            {complaints.length === 0 ? (
              <p style={{ fontSize: 12, color: theme.textMuted }}>No complaints yet.</p>
            ) : (
              complaints.map((c) => (
                <div key={c.reason} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: theme.text }}>{c.reason}</span>
                  <span style={chipStyle(theme.redBg, theme.red)}>
                    {c.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'negative' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th style={tableHeaderStyle}>Date</th>
                <th style={tableHeaderStyle}>Reason</th>
                <th style={tableHeaderStyle}>Model</th>
                <th style={tableHeaderStyle}>Mode</th>
              </tr>
            </thead>
            <tbody>
              {negativeFeedback.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: theme.textMuted }}>
                    No negative feedback yet.
                  </td>
                </tr>
              ) : (
                negativeFeedback.map((f) => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseOver={e => e.currentTarget.style.background = theme.inputBg}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...tableCellStyle, color: theme.textSecondary }}>{formatDate(f.created_at)}</td>
                    <td style={{ ...tableCellStyle, color: theme.text }}>{f.reason || '\u2014'}</td>
                    <td style={{ ...tableCellStyle, color: theme.textMuted }}>
                      {f.model ? (f.model.includes(':') ? f.model.split(':').pop() : f.model) : '\u2014'}
                    </td>
                    <td style={tableCellStyle}>
                      <span style={chipStyle(theme.accentBg, theme.textSecondary)}>
                        {f.mode || '\u2014'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'learnings' && (
        <div>
          {/* Learning summary */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, margin: 0 }}>
                Shared Learning Pool ({learnings.length})
              </h2>
              <span style={{ fontSize: 10, color: theme.textMuted }}>
                {learnings.filter(l => l.confidence >= 0.5).length} visible to users
              </span>
            </div>
          </div>

          {/* Learning table */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th style={tableHeaderStyle}>Type</th>
                  <th style={tableHeaderStyle}>Category</th>
                  <th style={tableHeaderStyle}>Learned</th>
                  <th style={tableHeaderStyle}>Confidence</th>
                  <th style={tableHeaderStyle}>Confirmations</th>
                  <th style={tableHeaderStyle}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {learnings.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: theme.textMuted }}>
                      No shared learnings yet.
                    </td>
                  </tr>
                ) : (
                  learnings.map((l) => {
                    const typeColors: Record<string, { bg: string; text: string }> = {
                      'tool-fix': { bg: theme.blueBg, text: theme.blue },
                      'error-recovery': { bg: theme.orangeBg, text: theme.orange },
                      'technique': { bg: theme.greenBg, text: theme.green },
                    };
                    const tc = typeColors[l.type] || { bg: theme.accentBg, text: theme.accent };
                    return (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${theme.border}` }}
                        onMouseOver={e => e.currentTarget.style.background = theme.inputBg}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={tableCellStyle}>
                          <span style={chipStyle(tc.bg, tc.text)}>{l.type}</span>
                        </td>
                        <td style={{ ...tableCellStyle, color: theme.textMuted }}>{l.category}</td>
                        <td style={{ ...tableCellStyle, color: theme.text, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.learned}>
                          {l.learned}
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 48, height: 6, borderRadius: 3, background: theme.inputBg, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                borderRadius: 3,
                                width: `${l.confidence * 100}%`,
                                background: l.confidence >= 0.7 ? theme.green : l.confidence >= 0.5 ? theme.yellow : theme.red,
                              }} />
                            </div>
                            <span style={{ fontSize: 10, color: theme.textMuted }}>{(l.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', color: theme.textMuted }}>{l.confirmations}</td>
                        <td style={{ ...tableCellStyle, color: theme.textMuted }}>{formatDate(l.updated_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 11, fontWeight: 500, color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? theme.green : theme.text, marginTop: 4, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
