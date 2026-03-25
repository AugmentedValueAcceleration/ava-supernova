import { useEffect, useState } from 'react';
import { supabase, supabaseAuth } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, sectionHeaderStyle } from '../lib/theme';

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
  admin: theme.accent,
  enterprise: theme.yellow,
  ultra: theme.blue,
  pro: theme.green,
  free: theme.textMuted,
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

        const { data: usageRow } = await supabase
          .from('usage')
          .select('*')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: userRow } = await supabase
          .from('users')
          .select('tier')
          .eq('id', userId)
          .single();

        const isAdmin = userRow?.tier === 'admin';
        const isUnlimited = isAdmin || (usageRow?.free_tokens_limit ?? 0) >= 999999999;

        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const { data: logs } = await supabase
          .from('usage_logs')
          .select('timestamp, input_tokens, output_tokens, model')
          .eq('user_id', userId)
          .gte('timestamp', fourteenDaysAgo.toISOString())
          .order('timestamp', { ascending: true })
          .limit(10000);

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
    <div style={pageStyle}>
      <PageHeader
        title="My Usage"
        subtitle={data?.period.start && data?.period.end ? `Period: ${formatDate(data.period.start)} — ${formatDate(data.period.end)}` : 'Current period'}
        onRefresh={fetchUsage}
        badge={data ? (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 400,
            background: `${TIER_COLORS[data.tier] || theme.textMuted}20`,
            color: TIER_COLORS[data.tier] || theme.textMuted,
            textTransform: 'uppercase',
          }}>
            {data.isAdmin ? '∞ Admin' : data.tier}
          </span>
        ) : undefined}
      />

      {loading ? (
        <div style={{ color: theme.textMuted, padding: 40, textAlign: 'center' }}>Loading usage data...</div>
      ) : error ? (
        <div style={{ color: theme.red, padding: 40, textAlign: 'center' }}>{error}</div>
      ) : data ? (
        <>
          {/* Token bars */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            <div style={cardStyle}>
              <div style={sectionHeaderStyle}>Free Tokens</div>
              {data.isUnlimited ? (
                <div style={{ fontSize: 36, fontWeight: 300, color: theme.accent, marginTop: 12 }}>∞</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 400, color: theme.accent }}>{formatNumber(data.period.free_tokens_used)}</span>
                    <span style={{ fontSize: 14, color: theme.textMuted, alignSelf: 'flex-end' }}>/ {formatNumber(data.period.free_tokens_limit)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: theme.inputBg, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: freePercent > 80 ? theme.red : freePercent > 60 ? theme.yellow : theme.accent, width: `${freePercent}%`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{formatNumber(Math.max(0, data.period.free_tokens_limit - data.period.free_tokens_used))} remaining</div>
                </>
              )}
            </div>

            <div style={cardStyle}>
              <div style={sectionHeaderStyle}>Plan Tokens</div>
              {data.period.tokens_limit ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 400, color: theme.green }}>{formatNumber(data.period.tokens_used)}</span>
                    <span style={{ fontSize: 14, color: theme.textMuted, alignSelf: 'flex-end' }}>/ {formatNumber(data.period.tokens_limit)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: theme.inputBg, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: subPercent > 80 ? theme.red : theme.green, width: `${subPercent}%`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{formatNumber(Math.max(0, data.period.tokens_limit - data.period.tokens_used))} remaining</div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: theme.textMuted, paddingTop: 12 }}>No active plan — using free tier</div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 32 }}>
            {[
              { label: 'Requests (14d)', value: data.totals.requests },
              { label: 'Tokens (14d)', value: formatNumber(data.totals.tokens) },
              { label: 'Active Days', value: data.totals.active_days },
            ].map(s => (
              <div key={s.label} style={{ ...cardStyle, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 400, color: theme.text }}>{s.value}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Model breakdown */}
          {data.models.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 32 }}>
              <div style={{ ...sectionHeaderStyle, marginBottom: 16 }}>By Model</div>
              {data.models.map((m) => {
                const pct = data.totals.tokens > 0 ? (m.total_tokens / data.totals.tokens) * 100 : 0;
                return (
                  <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 140, fontSize: 13, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model}</div>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: theme.inputBg, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: theme.accent, width: `${pct}%` }} />
                    </div>
                    <div style={{ width: 80, fontSize: 12, color: theme.textMuted, textAlign: 'right' }}>{formatNumber(m.total_tokens)}</div>
                    <div style={{ width: 50, fontSize: 11, color: theme.textMuted, textAlign: 'right' }}>{m.request_count}x</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Daily chart */}
          <div style={cardStyle}>
            <div style={{ ...sectionHeaderStyle, marginBottom: 16 }}>Daily Usage (14 days)</div>
            {data.daily.length === 0 ? (
              <div style={{ color: theme.textMuted, textAlign: 'center', padding: 24 }}>No usage data yet</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '0 4px' }}>
                {data.daily.map((d, i) => {
                  const barHeight = d.tokens > 0 ? Math.max(8, Math.round((d.tokens / maxDaily) * 140)) : 3;
                  const isToday = d.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                      <div style={{ fontSize: 9, color: d.tokens > 0 ? theme.textSecondary : theme.textMuted, whiteSpace: 'nowrap' }}>
                        {d.tokens > 0 ? formatNumber(d.tokens) : ''}
                      </div>
                      <div style={{
                        width: '100%', maxWidth: 40, height: barHeight, borderRadius: 4,
                        background: isToday ? theme.accent : d.tokens > 0 ? theme.accentBgStrong : theme.border,
                        transition: 'height 0.3s',
                      }} />
                      <div style={{ fontSize: 9, fontWeight: isToday ? 400 : 300, color: isToday ? theme.accent : theme.textMuted }}>
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
