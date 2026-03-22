import { useEffect, useState } from 'react';
import { supabase, supabaseAuth } from '../lib/supabase';
import PageHeader from '../components/PageHeader';

interface UsageSummary {
  period: {
    start: string | null;
    end: string | null;
    tokens_used: number;
    tokens_limit: number | null;
    free_tokens_used: number;
    free_tokens_limit: number;
    requests_count: number;
  };
  tier: string;
  isAdmin: boolean;
  isUnlimited: boolean;
  daily: Array<{ date: string; tokens: number }>;
  models: Array<{ model: string; input_tokens: number; output_tokens: number; total_tokens: number; request_count: number }>;
  totals: { tokens: number; requests: number; active_days: number };
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const TIER_COLORS: Record<string, string> = {
  admin: '#a855f7',
  enterprise: '#f59e0b',
  ultra: '#3b82f6',
  pro: '#10b981',
  free: '#6b7280',
};

export default function UserUsage() {
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsage = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: { user } } = await supabaseAuth.auth.getUser();
        if (!user?.id) { setError('Not signed in'); setLoading(false); return; }
        const userId = user.id;

        // Get usage row
        const { data: usageRow } = await supabase
          .from('usage')
          .select('*')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get user tier
        const { data: userRow } = await supabase
          .from('users')
          .select('tier')
          .eq('id', userId)
          .single();

        const isAdmin = userRow?.tier === 'admin';
        const isUnlimited = isAdmin || (usageRow?.free_tokens_limit ?? 0) >= 999999999;

        // Get daily logs (14 days)
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const { data: logs } = await supabase
          .from('usage_logs')
          .select('timestamp, input_tokens, output_tokens, model')
          .eq('user_id', userId)
          .gte('timestamp', fourteenDaysAgo.toISOString())
          .order('timestamp', { ascending: true })
          .limit(10000);

        // Aggregate
        const dailyMap: Record<string, number> = {};
        const modelMap: Record<string, { input: number; output: number; count: number }> = {};
        for (const log of (logs || [])) {
          const day = log.timestamp.slice(0, 10);
          const total = (log.input_tokens || 0) + (log.output_tokens || 0);
          dailyMap[day] = (dailyMap[day] || 0) + total;
          const model = log.model || 'unknown';
          if (!modelMap[model]) modelMap[model] = { input: 0, output: 0, count: 0 };
          modelMap[model].input += log.input_tokens || 0;
          modelMap[model].output += log.output_tokens || 0;
          modelMap[model].count += 1;
        }

        setData({
          period: {
            start: usageRow?.period_start || null,
            end: usageRow?.period_end || null,
            tokens_used: usageRow?.tokens_used || 0,
            tokens_limit: usageRow?.tokens_limit || null,
            free_tokens_used: usageRow?.free_tokens_used || 0,
            free_tokens_limit: usageRow?.free_tokens_limit || 3000000,
            requests_count: usageRow?.requests_count || 0,
          },
          tier: userRow?.tier || 'free',
          isAdmin,
          isUnlimited,
          daily: (() => {
            const padded: Array<{ date: string; tokens: number }> = [];
            const now = new Date();
            for (let i = 13; i >= 0; i--) {
              const d = new Date(now);
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().slice(0, 10);
              padded.push({ date: dateStr, tokens: dailyMap[dateStr] || 0 });
            }
            return padded;
          })(),
          models: Object.entries(modelMap).map(([model, s]) => ({
            model, input_tokens: s.input, output_tokens: s.output,
            total_tokens: s.input + s.output, request_count: s.count,
          })).sort((a, b) => b.total_tokens - a.total_tokens),
          totals: {
            tokens: Object.values(dailyMap).reduce((sum, t) => sum + t, 0),
            requests: (logs || []).length,
            active_days: Object.keys(dailyMap).length,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load usage');
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => { fetchUsage(); }, []);

  const freePercent = data ? Math.min(100, (data.period.free_tokens_used / data.period.free_tokens_limit) * 100) : 0;
  const subPercent = data?.period.tokens_limit ? Math.min(100, (data.period.tokens_used / data.period.tokens_limit) * 100) : 0;
  const maxDaily = data ? Math.max(...data.daily.map(d => d.tokens), 1) : 1;

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <PageHeader
        title="My Usage"
        subtitle={data?.period.start && data?.period.end ? `Period: ${formatDate(data.period.start)} — ${formatDate(data.period.end)}` : 'Current period'}
        onRefresh={fetchUsage}
        badge={data ? (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: `${TIER_COLORS[data.tier] || '#6b7280'}20`,
            color: TIER_COLORS[data.tier] || '#6b7280',
            textTransform: 'uppercase',
          }}>
            {data.isAdmin ? '∞ Admin' : data.tier}
          </span>
        ) : undefined}
      />

      {loading ? (
        <div style={{ color: '#6b7280', padding: 40, textAlign: 'center' }}>Loading usage data...</div>
      ) : error ? (
        <div style={{ color: '#ef4444', padding: 40, textAlign: 'center' }}>{error}</div>
      ) : data ? (
        <>
          {/* Token bars */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1px' }}>Free Tokens</div>
              {data.isUnlimited ? (
                <div style={{ fontSize: 36, fontWeight: 800, color: '#a855f7' }}>∞</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: '#a855f7' }}>{formatNumber(data.period.free_tokens_used)}</span>
                    <span style={{ fontSize: 14, color: '#6b7280', alignSelf: 'flex-end' }}>/ {formatNumber(data.period.free_tokens_limit)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#1a1a35', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: freePercent > 80 ? '#ef4444' : freePercent > 60 ? '#f59e0b' : '#a855f7', width: `${freePercent}%`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>{formatNumber(Math.max(0, data.period.free_tokens_limit - data.period.free_tokens_used))} remaining</div>
                </>
              )}
            </div>

            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1px' }}>Plan Tokens</div>
              {data.period.tokens_limit ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{formatNumber(data.period.tokens_used)}</span>
                    <span style={{ fontSize: 14, color: '#6b7280', alignSelf: 'flex-end' }}>/ {formatNumber(data.period.tokens_limit)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#1a1a35', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: subPercent > 80 ? '#ef4444' : '#10b981', width: `${subPercent}%`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>{formatNumber(Math.max(0, data.period.tokens_limit - data.period.tokens_used))} remaining</div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: '#6b7280', paddingTop: 8 }}>No active plan — using free tier</div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 32 }}>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{data.totals.requests}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Requests (14d)</div>
            </div>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{formatNumber(data.totals.tokens)}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Tokens (14d)</div>
            </div>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{data.totals.active_days}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Active Days</div>
            </div>
          </div>

          {/* Model breakdown */}
          {data.models.length > 0 && (
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, marginBottom: 32 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>By Model</div>
              {data.models.map((m) => {
                const pct = data.totals.tokens > 0 ? (m.total_tokens / data.totals.tokens) * 100 : 0;
                return (
                  <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 140, fontSize: 13, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model}</div>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1a1a35', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: '#a855f7', width: `${pct}%` }} />
                    </div>
                    <div style={{ width: 80, fontSize: 12, color: '#6b7280', textAlign: 'right' }}>{formatNumber(m.total_tokens)}</div>
                    <div style={{ width: 50, fontSize: 11, color: '#4b5563', textAlign: 'right' }}>{m.request_count}×</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Daily chart */}
          <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>Daily Usage (14 days)</div>
            {data.daily.length === 0 ? (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: 24 }}>No usage data yet</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '0 4px' }}>
                {data.daily.map((d, i) => {
                  const barHeight = d.tokens > 0 ? Math.max(8, Math.round((d.tokens / maxDaily) * 140)) : 3;
                  const isToday = d.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                      <div style={{ fontSize: 9, color: d.tokens > 0 ? '#9ca3af' : '#4b5563', whiteSpace: 'nowrap' }}>
                        {d.tokens > 0 ? formatNumber(d.tokens) : ''}
                      </div>
                      <div style={{
                        width: '100%', maxWidth: 40, height: barHeight, borderRadius: 4,
                        background: isToday ? '#a855f7' : d.tokens > 0 ? '#3b3b6b' : '#1f1f3a',
                        transition: 'height 0.3s',
                      }} />
                      <div style={{ fontSize: 9, fontWeight: isToday ? 600 : 400, color: isToday ? '#a855f7' : '#4b5563' }}>
                        {new Date(d.date).getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
