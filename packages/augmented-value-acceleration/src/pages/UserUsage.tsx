import { useEffect, useState } from 'react';
import { supabase, supabaseAuth } from '../lib/supabase';

interface UsageData {
  tokens_used: number;
  tokens_limit: number | null;
  free_tokens_used: number;
  free_tokens_limit: number;
  requests_count: number;
  period_start: string;
  period_end: string;
}

interface DailyUsage {
  date: string;
  tokens: number;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function UserUsage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      setLoading(true);
      try {
        // Get current user from auth client (has the session)
        const { data: { user } } = await supabaseAuth.auth.getUser();
        const userId = user?.id;
        if (!userId) { setLoading(false); return; }

        // Get latest usage row for this user
        const { data } = await supabase
          .from('usage')
          .select('*')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setUsage({
            tokens_used: data.tokens_used || 0,
            tokens_limit: data.tokens_limit,
            free_tokens_used: data.free_tokens_used || 0,
            free_tokens_limit: data.free_tokens_limit || 3000000,
            requests_count: data.requests_count || 0,
            period_start: data.period_start,
            period_end: data.period_end,
          });
        } else {
          setUsage({
            tokens_used: 0,
            tokens_limit: null,
            free_tokens_used: 0,
            free_tokens_limit: 3000000,
            requests_count: 0,
            period_start: new Date().toISOString().slice(0, 10),
            period_end: new Date().toISOString().slice(0, 10),
          });
        }

        // Get daily usage from usage_logs
        if (userId) {
          const fourteenDaysAgo = new Date();
          fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

          const { data: logs } = await supabase
            .from('usage_logs')
            .select('timestamp, input_tokens, output_tokens')
            .eq('user_id', userId)
            .gte('timestamp', fourteenDaysAgo.toISOString())
            .order('timestamp', { ascending: true });

          if (logs && logs.length > 0) {
            const byDay: Record<string, number> = {};
            for (const log of logs) {
              const day = log.timestamp.slice(0, 10);
              byDay[day] = (byDay[day] || 0) + (log.input_tokens || 0) + (log.output_tokens || 0);
            }
            setDaily(Object.entries(byDay).map(([date, tokens]) => ({ date, tokens })));
          }
        }
      } catch (err) {
        console.error('Failed to load usage:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, []);

  const freePercent = usage ? Math.min(100, (usage.free_tokens_used / usage.free_tokens_limit) * 100) : 0;
  const subPercent = usage?.tokens_limit ? Math.min(100, (usage.tokens_used / usage.tokens_limit) * 100) : 0;
  const freeRemaining = usage ? Math.max(0, usage.free_tokens_limit - usage.free_tokens_used) : 0;
  const subRemaining = usage?.tokens_limit ? Math.max(0, usage.tokens_limit - usage.tokens_used) : 0;
  const maxDaily = Math.max(...daily.map(d => d.tokens), 1);

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0, marginBottom: 8 }}>My Usage</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>
        {usage?.period_start && usage?.period_end
          ? `Period: ${formatDate(usage.period_start)} — ${formatDate(usage.period_end)}`
          : 'Current period'}
      </p>

      {loading ? (
        <div style={{ color: '#6b7280', padding: 40, textAlign: 'center' }}>Loading usage data...</div>
      ) : (
        <>
          {/* Token bars */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            {/* Free tokens */}
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1px' }}>Free Tokens</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#a855f7' }}>{formatNumber(usage?.free_tokens_used || 0)}</span>
                <span style={{ fontSize: 14, color: '#6b7280', alignSelf: 'flex-end' }}>/ {formatNumber(usage?.free_tokens_limit || 3000000)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#1a1a35', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: freePercent > 80 ? '#ef4444' : freePercent > 60 ? '#f59e0b' : '#a855f7', width: `${freePercent}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>{formatNumber(freeRemaining)} remaining</div>
            </div>

            {/* Subscription tokens */}
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1px' }}>Plan Tokens</div>
              {usage?.tokens_limit ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{formatNumber(usage.tokens_used)}</span>
                    <span style={{ fontSize: 14, color: '#6b7280', alignSelf: 'flex-end' }}>/ {formatNumber(usage.tokens_limit)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#1a1a35', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: subPercent > 80 ? '#ef4444' : '#10b981', width: `${subPercent}%`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>{formatNumber(subRemaining)} remaining</div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: '#6b7280', paddingTop: 8 }}>No active plan — using free tier</div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 32 }}>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{usage?.requests_count || 0}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Requests</div>
            </div>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{formatNumber((usage?.free_tokens_used || 0) + (usage?.tokens_used || 0))}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Total Tokens Used</div>
            </div>
            <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{daily.length}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Active Days (14d)</div>
            </div>
          </div>

          {/* Daily chart */}
          <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>Daily Usage (14 days)</div>
            {daily.length === 0 ? (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: 24 }}>No usage data yet</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {daily.map((d, i) => {
                  const h = Math.max(4, (d.tokens / maxDaily) * 100);
                  const isToday = d.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 9, color: '#6b7280' }}>{formatNumber(d.tokens)}</div>
                      <div style={{
                        width: '100%', height: `${h}%`, borderRadius: 4,
                        background: isToday ? '#a855f7' : '#2a2a4a',
                        transition: 'height 0.3s',
                      }} />
                      <div style={{ fontSize: 9, color: isToday ? '#a855f7' : '#4b5563' }}>
                        {new Date(d.date).getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
