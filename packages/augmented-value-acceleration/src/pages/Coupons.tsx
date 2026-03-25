import { useState, useEffect, useCallback, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, cardStyle, statCardStyle, primaryBtnStyle, ghostBtnStyle, labelStyle, tableHeaderStyle, tableCellStyle, chipStyle } from '../lib/theme';

interface Redemption {
  coupon_id: string;
  user_id: string;
  redeemed_at: string;
  plan: string | null;
  email?: string;
}

interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed' | 'free_months';
  value: number;
  duration: 'once' | 'repeating' | 'forever';
  duration_months: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  applicable_plans: string[];
  expires_at: string | null;
  active: boolean;
  created_at: string;
  stripe_coupon_id: string | null;
  notes: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function typeLabel(type: string, value: number): string {
  if (type === 'percent') return `${value}% off`;
  if (type === 'fixed') return `$${value} off`;
  if (type === 'free_months') return `${value} month${value === 1 ? '' : 's'} free`;
  return type;
}

function typeBadge(type: string): { bg: string; text: string } {
  if (type === 'percent') return { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80' };
  if (type === 'fixed') return { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa' };
  if (type === 'free_months') return { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7' };
  return { bg: '#1a1a35', text: '#9ca3af' };
}

function durationLabel(duration: string, months: number | null): string {
  if (duration === 'once') return 'Once';
  if (duration === 'repeating') return `${months || '?'} months`;
  if (duration === 'forever') return 'Forever';
  return duration;
}

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API || 'https://ava-supernova.com';

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<Record<string, Redemption[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'create'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState('percent');
  const [formValue, setFormValue] = useState('');
  const [formDuration, setFormDuration] = useState('once');
  const [formDurationMonths, setFormDurationMonths] = useState('');
  const [formMaxRedemptions, setFormMaxRedemptions] = useState('');
  const [formPlans, setFormPlans] = useState<string[]>([]);
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const fetchCoupons = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
      setCoupons(data || []);
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  async function loadRedemptions(couponId: string) {
    if (redemptions[couponId]) return;
    try {
      const { data } = await supabase
        .from('coupon_redemptions')
        .select('*')
        .eq('coupon_id', couponId)
        .order('redeemed_at', { ascending: false });
      setRedemptions(prev => ({ ...prev, [couponId]: data || [] }));
    } catch {
      // silent
    }
  }

  async function handleToggleActive(coupon: Coupon) {
    setActionLoading(coupon.id);
    try {
      await supabase
        .from('coupons')
        .update({ active: !coupon.active })
        .eq('id', coupon.id);
      await fetchCoupons();
    } finally {
      setActionLoading(null);
    }
  }

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
    setFormCode(code);
  }

  function togglePlan(plan: string) {
    setFormPlans(prev => prev.includes(plan) ? prev.filter(p => p !== plan) : [...prev, plan]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!formValue || Number(formValue) <= 0) {
      setFormError('Value must be a positive number.');
      return;
    }
    if (formType === 'percent' && Number(formValue) > 100) {
      setFormError('Percentage cannot exceed 100.');
      return;
    }
    if (formDuration === 'repeating' && (!formDurationMonths || Number(formDurationMonths) <= 0)) {
      setFormError('Duration months is required for repeating coupons.');
      return;
    }

    setCreating(true);

    try {
      const res = await fetch(`${PLATFORM_API}/api/admin/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formCode || undefined,
          type: formType,
          value: Number(formValue),
          duration: formDuration,
          duration_months: formDuration === 'repeating' ? Number(formDurationMonths) : undefined,
          max_redemptions: formMaxRedemptions ? Number(formMaxRedemptions) : undefined,
          applicable_plans: formPlans.length > 0 ? formPlans : undefined,
          expires_at: formExpiresAt || undefined,
          notes: formNotes || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Failed to create coupon.');
        return;
      }

      setFormSuccess(`Coupon ${data.coupon?.code || ''} created successfully.`);
      setFormCode(''); setFormType('percent'); setFormValue('');
      setFormDuration('once'); setFormDurationMonths('');
      setFormMaxRedemptions(''); setFormPlans([]); setFormExpiresAt('');
      setFormNotes('');
      await fetchCoupons();
    } catch {
      setFormError('An unexpected error occurred.');
    } finally {
      setCreating(false);
    }
  }

  function valueLabel(): string {
    if (formType === 'percent') return '% off';
    if (formType === 'fixed') return '$ off';
    if (formType === 'free_months') return 'months';
    return '';
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: theme.pageBg }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>Loading coupons...</div>
      </div>
    );
  }

  const activeCoupons = coupons.filter(c => c.active);
  const inactiveCoupons = coupons.filter(c => !c.active);

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

      <PageHeader title="Coupons" subtitle="Create and manage discount coupons for subscriptions." onRefresh={fetchCoupons} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 10, padding: 4, marginBottom: 24 }}>
        <button onClick={() => setTab('active')} style={tabStyle(tab === 'active')}>
          Active Coupons ({activeCoupons.length})
        </button>
        <button onClick={() => setTab('create')} style={tabStyle(tab === 'create')}>Create New</button>
      </div>

      {/* Active tab */}
      {tab === 'active' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Active Coupons</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginTop: 4 }}>{activeCoupons.length}</div>
            </div>
            <div style={{ background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Total Redemptions</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                {coupons.reduce((sum, c) => sum + c.times_redeemed, 0)}
              </div>
            </div>
            <div style={{ background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>Inactive / Expired</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#6b7280', marginTop: 4 }}>{inactiveCoupons.length}</div>
            </div>
          </div>

          {/* Coupons table */}
          <div style={{ background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f1f3a', background: theme.cardBg }}>
                  {['Code', 'Type', 'Duration', 'Redeemed', 'Expires', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#6b7280' }}>
                      No coupons yet. Create one to get started.
                    </td>
                  </tr>
                ) : (
                  coupons.map((coupon) => {
                    const tb = typeBadge(coupon.type);
                    const isExpanded = expandedId === coupon.id;
                    return (
                      <Fragment key={coupon.id}>
                        <tr
                          onClick={() => {
                            setExpandedId(isExpanded ? null : coupon.id);
                            if (!isExpanded) loadRedemptions(coupon.id);
                          }}
                          style={{ borderBottom: '1px solid #1f1f3a', cursor: 'pointer' }}
                          onMouseOver={(e) => (e.currentTarget.style.background = '#1a1a35')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Code */}
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ background: '#1a1a35', padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                              {coupon.code}
                            </span>
                            {coupon.notes && (
                              <span style={{ marginLeft: 8, fontSize: 10, color: '#6b7280' }} title={coupon.notes}>
                                {coupon.notes.length > 25 ? coupon.notes.slice(0, 25) + '...' : coupon.notes}
                              </span>
                            )}
                          </td>
                          {/* Type */}
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ background: tb.bg, color: tb.text, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10 }}>
                              {typeLabel(coupon.type, coupon.value)}
                            </span>
                          </td>
                          {/* Duration */}
                          <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{durationLabel(coupon.duration, coupon.duration_months)}</td>
                          {/* Redeemed */}
                          <td style={{ padding: '10px 16px', color: '#9ca3af' }}>
                            {coupon.times_redeemed}/{coupon.max_redemptions ?? '\u221E'}
                          </td>
                          {/* Expires */}
                          <td style={{ padding: '10px 16px', color: '#6b7280' }}>
                            {coupon.expires_at ? formatDate(coupon.expires_at) : 'Never'}
                          </td>
                          {/* Status */}
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: coupon.active ? '#4ade80' : '#6b7280',
                              }} />
                              <span style={{ fontSize: 10, color: '#9ca3af' }}>{coupon.active ? 'Active' : 'Inactive'}</span>
                            </span>
                          </td>
                          {/* Actions */}
                          <td style={{ padding: '10px 16px' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => handleCopy(coupon.code, coupon.id)}
                                style={{ background: 'none', border: '1px solid #1f1f3a', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: copiedId === coupon.id ? '#4ade80' : '#6b7280', cursor: 'pointer' }}
                              >
                                {copiedId === coupon.id ? 'Copied' : 'Copy'}
                              </button>
                              <button
                                onClick={() => handleToggleActive(coupon)}
                                disabled={actionLoading === coupon.id}
                                style={{
                                  background: 'none',
                                  border: '1px solid #1f1f3a',
                                  borderRadius: 6,
                                  padding: '4px 8px',
                                  fontSize: 10,
                                  color: coupon.active ? '#fb923c' : '#4ade80',
                                  cursor: actionLoading === coupon.id ? 'not-allowed' : 'pointer',
                                  opacity: actionLoading === coupon.id ? 0.5 : 1,
                                }}
                              >
                                {coupon.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded redemption details */}
                        {isExpanded && (
                          <tr style={{ borderBottom: '1px solid #1f1f3a', background: theme.pageBg }}>
                            <td colSpan={7} style={{ padding: '16px 24px' }}>
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: '#6b7280', marginBottom: 12 }}>
                                <span>Created: {formatDateTime(coupon.created_at)}</span>
                                {coupon.stripe_coupon_id && <span>Stripe: {coupon.stripe_coupon_id}</span>}
                                {coupon.applicable_plans?.length > 0 && <span>Plans: {coupon.applicable_plans.join(', ')}</span>}
                                {coupon.notes && <span>Notes: {coupon.notes}</span>}
                              </div>
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
                                  Redemptions ({redemptions[coupon.id]?.length || coupon.times_redeemed})
                                </p>
                                {!redemptions[coupon.id] ? (
                                  <p style={{ fontSize: 10, color: '#6b7280' }}>Loading...</p>
                                ) : redemptions[coupon.id].length === 0 ? (
                                  <p style={{ fontSize: 10, color: '#6b7280' }}>No redemptions yet.</p>
                                ) : (
                                  redemptions[coupon.id].map((r, i) => (
                                    <div key={i} style={{
                                      display: 'flex', alignItems: 'center', gap: 16,
                                      background: theme.cardBg, borderRadius: 8, padding: '8px 12px', marginBottom: 4, fontSize: 10,
                                    }}>
                                      <span style={{ color: '#fff' }}>{r.email || r.user_id}</span>
                                      {r.plan && (
                                        <span style={{ background: '#1a1a35', padding: '2px 8px', borderRadius: 10, textTransform: 'capitalize', color: '#9ca3af' }}>
                                          {r.plan}
                                        </span>
                                      )}
                                      <span style={{ marginLeft: 'auto', color: '#6b7280' }}>{formatDateTime(r.redeemed_at)}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create tab */}
      {tab === 'create' && (
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 14, padding: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 16, margin: '0 0 16px 0' }}>New Coupon</h2>

            {formError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: '#f87171', marginBottom: 16 }}>
                {formError}
              </div>
            )}
            {formSuccess && (
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: '#4ade80', marginBottom: 16 }}>
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleCreate}>
              {/* Code */}
              <FormLabel text="Coupon Code" />
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value.toUpperCase())} placeholder="Auto-generated if empty" maxLength={20} style={inputStyle} />
                <button type="button" onClick={generateRandomCode} style={{ ...btnSecondary, flexShrink: 0 }}>Generate</button>
              </div>

              {/* Type */}
              <FormLabel text="Discount Type" />
              <select value={formType} onChange={(e) => setFormType(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount</option>
                <option value="free_months">Free months</option>
              </select>

              {/* Value */}
              <FormLabel text={`Value (${valueLabel()})`} />
              <input type="number" value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder={formType === 'percent' ? 'e.g. 50' : formType === 'fixed' ? 'e.g. 10' : 'e.g. 3'} min="1" max={formType === 'percent' ? '100' : undefined} style={{ ...inputStyle, marginBottom: 16 }} />

              {/* Duration */}
              <FormLabel text="Duration" />
              <select value={formDuration} onChange={(e) => setFormDuration(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
                <option value="once">Once</option>
                <option value="repeating">Repeating</option>
                <option value="forever">Forever</option>
              </select>

              {formDuration === 'repeating' && (
                <>
                  <FormLabel text="Repeat for (months)" />
                  <input type="number" value={formDurationMonths} onChange={(e) => setFormDurationMonths(e.target.value)} placeholder="e.g. 3" min="1" style={{ ...inputStyle, marginBottom: 16 }} />
                </>
              )}

              {/* Max redemptions */}
              <FormLabel text="Max Redemptions (0 = unlimited)" />
              <input type="number" value={formMaxRedemptions} onChange={(e) => setFormMaxRedemptions(e.target.value)} placeholder="0" min="0" style={{ ...inputStyle, marginBottom: 16 }} />

              {/* Plans */}
              <FormLabel text="Applicable Plans (none = all)" />
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                {['pro', 'ultra', 'enterprise'].map((plan) => (
                  <label key={plan} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}>
                    <input type="checkbox" checked={formPlans.includes(plan)} onChange={() => togglePlan(plan)} style={{ accentColor: '#a855f7' }} />
                    <span style={{ textTransform: 'capitalize' }}>{plan}</span>
                  </label>
                ))}
              </div>

              {/* Expiry */}
              <FormLabel text="Expiry Date (optional)" />
              <input type="datetime-local" value={formExpiresAt} onChange={(e) => setFormExpiresAt(e.target.value)} style={{ ...inputStyle, marginBottom: 16, colorScheme: 'dark' }} />

              {/* Notes */}
              <FormLabel text="Internal Notes (optional)" />
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder='e.g. "Stream giveaway March 22"' rows={2} style={{ ...inputStyle, marginBottom: 20, resize: 'none' }} />

              {/* Submit */}
              <button type="submit" disabled={creating} style={{
                width: '100%',
                background: '#a855f7',
                border: 'none',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.5 : 1,
              }}>
                {creating ? 'Creating...' : 'Create Coupon'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FormLabel({ text }: { text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 500, color: theme.textMuted, marginBottom: 6 }}>{text}</div>;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: theme.inputBg,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 12,
  color: theme.text,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const btnSecondary: React.CSSProperties = {
  background: theme.inputBg,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 12,
  color: theme.textSecondary,
  cursor: 'pointer',
};
