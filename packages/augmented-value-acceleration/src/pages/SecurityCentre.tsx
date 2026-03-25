import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, statCardStyle, primaryBtnStyle, chipStyle } from '../lib/theme';

interface ScanSummary { totalFindings: number; critical: number; high: number; medium: number; low: number; info: number; filesScanned?: number; }
interface ScanFinding { type: 'dependency' | 'secret' | 'code'; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; title: string; file?: string; line?: number; description: string; code?: string; status?: 'open' | 'resolved' | 'ignored'; note?: string; }
interface ScanRecord { id: string; repo: string; status: 'running' | 'completed' | 'failed'; summary: ScanSummary | null; started_at: string; completed_at: string | null; }

const REPOS = [
  { id: 'ava-supernova', label: 'Ava | Supernova (Core)' },
  { id: 'ava-supernova-platform', label: 'Platform (Web)' },
  { id: 'ava-supernova-companion', label: 'Companion (Mobile)' },
  { id: 'ava-supernova-ide', label: 'IDE (Eclipse Theia)' },
];

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: theme.redBg, text: theme.red, border: `${theme.red}40` },
  high: { bg: theme.orangeBg, text: theme.orange, border: `${theme.orange}40` },
  medium: { bg: theme.yellowBg, text: theme.yellow, border: `${theme.yellow}40` },
  low: { bg: theme.blueBg, text: theme.blue, border: `${theme.blue}40` },
  info: { bg: 'rgba(107, 114, 128, 0.15)', text: theme.textSecondary, border: `${theme.textSecondary}40` },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const PLATFORM_API = import.meta.env.VITE_PLATFORM_API || 'https://ava-supernova.com';

export default function SecurityCentre() {
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set(['ava-supernova']));
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'complete' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<number | string | null>(null);
  const [activeTab, setActiveTab] = useState<'results' | 'history'>('results');

  const loadHistory = useCallback(async () => {
    try { const { data } = await supabase.from('security_scans').select('*').order('started_at', { ascending: false }).limit(50); setHistory(data || []); } catch { /* silent */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function toggleRepo(id: string) { setSelectedRepos((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  async function runScan() {
    if (selectedRepos.size === 0 || scanning) return;
    setScanning(true); setPhase('scanning'); setProgressMsg('Starting scan...'); setFindings([]); setSummary(null); setActiveTab('results');
    const allFindings: ScanFinding[] = [];
    for (const repo of selectedRepos) {
      setProgressMsg(`Scanning ${repo}...`);
      try {
        const initRes = await fetch(`${PLATFORM_API}/api/admin/security`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo }) });
        if (!initRes.ok) { setProgressMsg(`Failed to start scan for ${repo}`); continue; }
        const initData = await initRes.json(); const scanId = initData.scanId;
        const res = await fetch(`${PLATFORM_API}/api/admin/security/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, scanId }) });
        if (!res.ok || !res.body) { setProgressMsg(`Scan failed for ${repo}: ${res.status}`); continue; }
        const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); }
            else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                switch (currentEvent) {
                  case 'phase': setProgressMsg(data.message || ''); break;
                  case 'progress': if (data.message) setProgressMsg(data.message); else if (data.scanned && data.total) { setProgressMsg(`${repo}: ${data.scanned}/${data.total} files (${data.findings || 0} findings)`); } break;
                  case 'complete': if (data.findings) allFindings.push(...data.findings); if (data.summary) setSummary((prev) => { if (!prev) return data.summary; return { totalFindings: prev.totalFindings + data.summary.totalFindings, critical: prev.critical + data.summary.critical, high: prev.high + data.summary.high, medium: prev.medium + data.summary.medium, low: prev.low + data.summary.low, info: prev.info + data.summary.info, filesScanned: (prev.filesScanned || 0) + (data.summary.filesScanned || 0) }; }); break;
                  case 'error': setPhase('error'); setProgressMsg(data.message || 'Scan failed'); break;
                }
              } catch { /* skip */ }
              currentEvent = '';
            }
          }
        }
      } catch (err) { setPhase('error'); setProgressMsg(err instanceof Error ? err.message : 'Scan failed'); }
    }
    allFindings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    setFindings(allFindings); setPhase('complete'); setScanning(false); setProgressMsg('Scan complete'); loadHistory();
  }

  function copyAllResults() {
    const text = findings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}\nType: ${f.type}${f.file ? `\nFile: ${f.file}${f.line ? `:${f.line}` : ''}` : ''}\n${f.description}${f.code ? `\nCode: ${f.code}` : ''}\n`).join('\n---\n\n');
    navigator.clipboard.writeText(text); setCopyFeedback('all'); setTimeout(() => setCopyFeedback(null), 2000);
  }

  function updateFindingStatus(idx: number, status: 'open' | 'resolved' | 'ignored') { const updated = [...findings]; updated[idx] = { ...updated[idx], status }; setFindings(updated); }

  const tabStyle = (isActive: boolean) => ({
    flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: isActive ? 400 : 300,
    color: isActive ? '#fff' : theme.textMuted, background: isActive ? theme.cardBg : 'transparent',
    border: 'none', borderRadius: 8, cursor: 'pointer' as const,
  });

  return (
    <div style={pageStyle}>
      <PageHeader title="Security Scanner" subtitle="Automated vulnerability detection across repositories." onRefresh={loadHistory} />

      {/* Repo selector + Run */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted, marginBottom: 10 }}>Select Repositories</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {REPOS.map((repo) => (
                <label key={repo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: theme.textSecondary }}>
                  <input type="checkbox" checked={selectedRepos.has(repo.id)} onChange={() => toggleRepo(repo.id)} style={{ accentColor: theme.accent }} />
                  {repo.label}
                </label>
              ))}
            </div>
          </div>
          <button onClick={runScan} disabled={scanning || selectedRepos.size === 0} style={{ ...primaryBtnStyle, cursor: scanning || selectedRepos.size === 0 ? 'not-allowed' : 'pointer', opacity: scanning || selectedRepos.size === 0 ? 0.5 : 1 }}>
            {scanning ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
        {phase !== 'idle' && (
          <div style={{ marginTop: 16, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            {scanning && <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${theme.border}`, borderTopColor: theme.accent, animation: 'spin 1s linear infinite' }} />}
            {phase === 'complete' && <span style={{ color: theme.green, fontSize: 14 }}>&#10003;</span>}
            {phase === 'error' && <span style={{ color: theme.red, fontSize: 14 }}>&#10007;</span>}
            <span style={{ fontSize: 13, color: theme.textSecondary }}>{progressMsg}</span>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total', value: summary.totalFindings, color: theme.text },
            { label: 'Critical', value: summary.critical, color: theme.red },
            { label: 'High', value: summary.high, color: theme.orange },
            { label: 'Medium', value: summary.medium, color: theme.yellow },
            { label: 'Low', value: summary.low, color: theme.blue },
            { label: 'Files', value: summary.filesScanned || 0, color: theme.textSecondary },
          ].map((card) => (
            <div key={card.label} style={{ ...statCardStyle, textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted }}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 400, color: card.color, marginTop: 4 }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: theme.inputBg, borderRadius: 10, padding: 4, marginBottom: 20 }}>
        <button onClick={() => setActiveTab('results')} style={tabStyle(activeTab === 'results')}>Results{findings.length > 0 ? ` (${findings.length})` : ''}</button>
        <button onClick={() => setActiveTab('history')} style={tabStyle(activeTab === 'history')}>History ({history.length})</button>
      </div>

      {/* Results */}
      {activeTab === 'results' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {findings.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textMuted }}>
              {phase === 'idle' ? 'Select repositories and run a scan to see results.' : phase === 'complete' ? 'No findings detected. Looking clean.' : 'Scan in progress...'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${theme.border}` }}>
                <button onClick={copyAllResults} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 11, color: theme.textSecondary, cursor: 'pointer' }}>
                  {copyFeedback === 'all' ? 'Copied!' : 'Copy All Results'}
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: theme.textMuted }}>
                  {findings.filter(f => !f.status || f.status === 'open').length} open &middot; {findings.filter(f => f.status === 'resolved').length} resolved &middot; {findings.filter(f => f.status === 'ignored').length} ignored
                </span>
              </div>
              {findings.map((finding, idx) => {
                const sc = SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.info;
                const isExpanded = expandedFinding === idx;
                return (
                  <div key={idx} style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, opacity: finding.status === 'resolved' ? 0.4 : finding.status === 'ignored' ? 0.3 : 1 }}>
                    <button onClick={() => setExpandedFinding(isExpanded ? null : idx)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', padding: 0 }}>
                      <span style={{ ...chipStyle(sc.bg, sc.text), border: `1px solid ${sc.border}`, textTransform: 'uppercase', flexShrink: 0, marginTop: 2 }}>{finding.severity}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 400, color: finding.status === 'resolved' ? theme.textMuted : theme.text, textDecoration: finding.status === 'resolved' ? 'line-through' : 'none' }}>{finding.title}</span>
                          <span style={chipStyle(theme.inputBg, theme.textMuted)}>{finding.type}</span>
                          {finding.status && finding.status !== 'open' && <span style={chipStyle(finding.status === 'resolved' ? theme.greenBg : 'rgba(107,114,128,0.15)', finding.status === 'resolved' ? theme.green : theme.textSecondary)}>{finding.status}</span>}
                        </div>
                        {finding.file && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{finding.file}{finding.line ? `:${finding.line}` : ''}</div>}
                      </div>
                      <span style={{ color: theme.textMuted, fontSize: 12, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>&#9660;</span>
                    </button>
                    {isExpanded && (
                      <div style={{ marginTop: 12, marginLeft: 76 }}>
                        <p style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>{finding.description}</p>
                        {finding.code && <pre style={{ background: theme.inputBg, borderRadius: 8, padding: 12, fontSize: 11, color: theme.textSecondary, overflowX: 'auto', marginBottom: 12 }}><code>{finding.code}</code></pre>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(['open', 'resolved', 'ignored'] as const).map((s) => (
                            <button key={s} onClick={() => updateFindingStatus(idx, s)} style={{
                              fontSize: 10, fontWeight: 400, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                              border: (finding.status || 'open') === s ? 'none' : `1px solid ${theme.border}`,
                              background: (finding.status || 'open') === s ? (s === 'resolved' ? theme.greenBg : s === 'ignored' ? 'rgba(107,114,128,0.2)' : theme.redBg) : 'transparent',
                              color: (finding.status || 'open') === s ? (s === 'resolved' ? theme.green : s === 'ignored' ? theme.textSecondary : theme.red) : theme.textMuted,
                            }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                          ))}
                          <button onClick={() => { navigator.clipboard.writeText(`[${finding.severity.toUpperCase()}] ${finding.title}\n${finding.description}`); setCopyFeedback(idx); setTimeout(() => setCopyFeedback(null), 2000); }} style={{ marginLeft: 'auto', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer' }}>
                            {copyFeedback === idx ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {history.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textMuted }}>No scan history yet.</div>
          ) : (
            history.map((scan, i) => (
              <div key={scan.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: i < history.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: scan.status === 'completed' ? theme.green : scan.status === 'running' ? theme.yellow : theme.red }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 400, color: theme.text }}>{scan.repo}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{new Date(scan.started_at).toLocaleString()}{scan.completed_at && ` — ${Math.round((new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000)}s`}</div>
                </div>
                {scan.status === 'completed' && scan.summary && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {scan.summary.critical > 0 && <span style={chipStyle(theme.redBg, theme.red)}>{scan.summary.critical} CRIT</span>}
                    {scan.summary.high > 0 && <span style={chipStyle(theme.orangeBg, theme.orange)}>{scan.summary.high} HIGH</span>}
                    {scan.summary.medium > 0 && <span style={chipStyle(theme.yellowBg, theme.yellow)}>{scan.summary.medium} MED</span>}
                    {scan.summary.totalFindings === 0 && <span style={chipStyle(theme.greenBg, theme.green)}>CLEAN</span>}
                  </div>
                )}
                {scan.status === 'running' && <span style={{ fontSize: 11, color: theme.yellow }}>Running...</span>}
                {scan.status === 'failed' && <span style={{ fontSize: 11, color: theme.red }}>Failed</span>}
              </div>
            ))
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
