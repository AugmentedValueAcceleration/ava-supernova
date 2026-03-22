import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dpxdjnpqaxhsydoeaogl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ybkHcxMBrDDfho78Wz4v8w_qTBqP_f5';
const SUPABASE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';

// Auth client — used for user authentication (anon key, single instance)
export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (service role) — bypasses RLS for admin operations
// Falls back to auth client if service key not set
export const supabase = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : supabaseAuth;

export async function getStats() {
  const [users, tickets, scans] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('security_scans').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
  ]);

  return {
    totalUsers: users.count ?? 0,
    openTickets: tickets.count ?? 0,
    totalScans: scans.count ?? 0,
  };
}

export async function getRecentActivity() {
  const { data } = await supabase
    .from('release_notes')
    .select('version, title, published_at')
    .eq('visible', true)
    .order('published_at', { ascending: false })
    .limit(5);

  return (data || []).map(r => ({
    text: `v${r.version} — ${r.title}`,
    time: formatTimeAgo(new Date(r.published_at)),
  }));
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
