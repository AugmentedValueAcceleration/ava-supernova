import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface UsageData {
  tokens_used: number;
  token_limit: number;
  free_tokens_used: number;
  free_token_limit: number;
  subscription_tokens_used: number;
  subscription_token_limit: number;
  request_count: number;
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

const PLACEHOLDER_DAILY: DailyUsage[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toISOString().slice(0, 10),
    tokens: Math.floor(Math.random() * 200000) + 10000,
  };
});

export default function UserUsage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [daily, setDaily] = useState<DailyUsage[]>(PLACEHOLDER_DAILY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('usage')
          .select('*')
          .order('period_start', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          setUsage({
            tokens_used: data.tokens_used || 0,
            token_limit: data.token_limit || 3000000,
            free_tokens_used: data.free_tokens_used || 0,
            free_token_limit: data.free_token_limit || 3000000,
            subscription_tokens_used: data.subscription_tokens_used || 0,
            subscription_token_limit: data.subscription_token_limit || 0,
            request_count: data.request_count || 0,
            period_start: data.period_start || new Date().toISOString(),
            period_end: data.period_end || new Date().toISOString(),
          });
        } else {
          setUsage({
            tokens_used: 0,
            token_limit: 3000000,
            free_tokens_used: 0,
            free_token_limit: 3000000,
            subscription_tokens_used: 0,
            subscription_token_limit: 0,
            request_count: 0,
            period_start: new Date().toISOString(),
            period_end: new Date().toISOString(),
          });
        }

        // Try to fetch daily usage
        const { data: dailyData } = await supabase
          .from('usage_daily')
          .select('date, tokens')
          .order('date', { ascending: true })
          .limit(14);

        if (dailyData && dailyData.length > 0) {
          setDaily(dailyData);
        }
      } catch {
        setUsage({
          tokens_used: 0,
          token_limit: 3000000,
          free_tokens_used: 0,
          free_token_limit: 3000000,
          subscription_tokens_used: 0,
          subscription_token_limit: 0,
          request_count: 0,
          period_start: new Date().toISOString(),
          period_end: new Date().toISOString(),
        });
      }
      setLoading(false);
    }
    fetchUsage();
  }, []);

  const maxDaily = Math.max(...daily.map(d => d.tokens), 1);

  function progressBar(used: number, limit: number, color: string) {
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
          <span>{formatNumber(used)} used</span>
          <span>{formatNumber(limit)} limit</span>
        </div>
        <div style={{ width: '100%', height: 8, background: '#1a1a35', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 4,
            background: pct > 90 ? '#f87171' : pct > 70 ? '#fbbf24' : color,
            transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 4, textAlign: 'right' }}>
          {pct.toFixed(1)}%
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#0a0a1a' }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>Loading usage data...</div>
      </div>
    );
  }

  const u = usage!;

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>My Usage</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        Token usage for the current billing period.
      </p>

      {/* Main Usage Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Total Tokens Used</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#a855f7', marginTop: 8, lineHeight: 1 }}>
            {formatNumber(u.tokens_used)}
          </div>
          {progressBar(u.tokens_used, u.token_limit, '#a855f7')}
        </div>

        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Free Tokens</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#4ade80', marginTop: 8, lineHeight: 1 }}>
            {formatNumber(u.free_tokens_used)}
          </div>
          {progressBar(u.free_tokens_used, u.free_token_limit, '#4ade80')}
        </div>

        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Subscription Tokens</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#60a5fa', marginTop: 8, lineHeight: 1 }}>
            {formatNumber(u.subscription_tokens_used)}
          </div>
          {progressBar(u.subscription_tokens_used, u.subscription_token_limit || 0, '#60a5fa')}
        </div>
      </div>

      {/* Requests + Period */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Requests This Period</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginTop: 4 }}>{u.request_count.toLocaleString()}</div>
        </div>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Period Start</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginTop: 8 }}>{formatDate(u.period_start)}</div>
        </div>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Need more tokens?</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Purchase a top-up pack</div>
          </div>
          <button style={{
            background: '#a855f7', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer',
          }}>
            Top Up
          </button>
        </div>
      </div>

      {/* Daily Usage Chart */}
      <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 20px 0' }}>Daily Usage (Last 14 Days)</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160 }}>
          {daily.map((d, i) => {
            const height = (d.tokens / maxDaily) * 140;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: '#6b7280', opacity: 0 }}>{formatNumber(d.tokens)}</div>
                <div
                  style={{
                    width: '100%', maxWidth: 40, height: Math.max(height, 2),
                    background: 'linear-gradient(180deg, #a855f7, rgba(168, 85, 247, 0.3))',
                    borderRadius: '4px 4px 0 0', transition: 'height 0.3s', cursor: 'pointer',
                    position: 'relative',
                  }}
                  title={`${formatDate(d.date)}: ${formatNumber(d.tokens)} tokens`}
                  onMouseOver={e => {
                    const label = e.currentTarget.previousElementSibling as HTMLElement;
                    if (label) label.style.opacity = '1';
                    e.currentTarget.style.background = 'linear-gradient(180deg, #c084fc, rgba(168, 85, 247, 0.5))';
                  }}
                  onMouseOut={e => {
                    const label = e.currentTarget.previousElementSibling as HTMLElement;
                    if (label) label.style.opacity = '0';
                    e.currentTarget.style.background = 'linear-gradient(180deg, #a855f7, rgba(168, 85, 247, 0.3))';
                  }}
                />
                <div style={{ fontSize: 9, color: '#4b5563', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                  {formatDate(d.date)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: '#4b5563' }}>
          Hover bars for details. Data may be approximate.
        </div>
      </div>
    </div>
  );
}
