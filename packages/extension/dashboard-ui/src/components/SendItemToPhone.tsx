// "Send to phone" for one recipe or exercise (Health Part 5b, mockup approved
// 14 Nov 2026). ONE SHARED FILE: identical in the extension and the IDE apart
// from the import lines, like the wizard. Inline styles only, so it looks the
// same in both.
//
// The link is just the item's public page on avasupernova.com, with the
// person's cooking level for a recipe (?level=). Nothing about them is in it.

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import qrcode from 'qrcode-generator';
import { sharedWorkoutUrl, workoutFromDay } from '../../../../core/dist/health/share-workout.js';
import { t, tt, useLocale } from '../i18n';

export type PhoneItem = { kind: 'recipe' | 'exercise'; slug: string; name: string };

const LEVELS = ['beginner', 'intermediate', 'expert'];

/** The public page for an item, opened at their cooking level when it is one. */
export function phoneUrl(item: PhoneItem, cookingLevel?: string | null): string {
  const base = `https://avasupernova.com/health/${item.kind === 'recipe' ? 'recipes' : 'exercises'}/${encodeURIComponent(item.slug)}`;
  return item.kind === 'recipe' && cookingLevel && LEVELS.includes(cookingLevel) ? `${base}?level=${cookingLevel}` : base;
}

const border = '1px solid color-mix(in srgb, var(--accent) 30%, transparent)';
const btn: CSSProperties = { flex: 1, minHeight: 38, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };

/** The small button that opens it, for a detail page's header. */
export function SendToPhoneButton({ onClick }: { onClick: () => void }) {
  useLocale();
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28, padding: '0 10px', borderRadius: 6, border, background: 'transparent', color: 'var(--text-primary, #cdd6f4)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
      {tt('health.phone.send', 'Send to phone')}
    </button>
  );
}

/** The QR dialog itself: a link for the phone, with WhatsApp and Copy. */
export function PhoneQrDialog({ title, body, url, waText, privacy, onClose, onOpenUrl }: {
  title: string;
  body: string;
  /** null while the link is being made. */
  url: string | null;
  waText: string;
  privacy: string;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
}) {
  useLocale();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const qr = useMemo(() => {
    if (!url) return null;
    const q = qrcode(0, 'M');
    q.addData(url, 'Byte');
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [url]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, borderRadius: 14, border, background: 'linear-gradient(135deg,#100d1a,#181327)', padding: 22, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', color: '#cdd6f4' }}>
        <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 600 }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={tt('health.phone.close', 'Close')} style={{ background: 'transparent', border: 'none', color: '#9b8caa', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        {qr ? (
          <svg role="img" aria-label={tt('health.phone.qr', 'QR code for this page')} viewBox={`-2 -2 ${qr.n + 4} ${qr.n + 4}`} width="208" height="208" shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 10 }}>
            <path d={qr.d} fill="#111" />
          </svg>
        ) : (
          <div style={{ width: 208, height: 208, borderRadius: 10, background: 'rgba(255,255,255,0.06)' }} aria-hidden />
        )}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#c9c3d6', textAlign: 'center' }}>{body}</p>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'stretch' }}>
          <button type="button" disabled={!url} style={{ ...btn, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600 }}
            onClick={() => url && onOpenUrl(`https://wa.me/?text=${encodeURIComponent(`${waText}: ${url}`)}`)}>
            {tt('health.phone.whatsapp', 'Send to WhatsApp')}
          </button>
          <button type="button" disabled={!url} style={{ ...btn, border, background: 'transparent', color: '#cdd6f4' }}
            onClick={() => { if (url) void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {}); }}>
            {copied ? tt('health.phone.copied', 'Copied') : tt('health.phone.copy', 'Copy link')}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: '#9b8caa', textAlign: 'center' }}>{privacy}</p>
      </div>
    </div>
  );
}

/** One recipe or exercise: its public page, a recipe at their cooking level. */
export function SendItemToPhone({ item, cookingLevel, onClose, onOpenUrl }: {
  item: PhoneItem;
  cookingLevel?: string | null;
  onClose: () => void;
  /** How this app opens a web link (WhatsApp). */
  onOpenUrl: (url: string) => void;
}) {
  useLocale();
  const levelName = item.kind === 'recipe' && cookingLevel && LEVELS.includes(cookingLevel)
    ? t(`health.profile.level.${cookingLevel}`)
    : null;
  const title = item.kind === 'recipe' ? tt('health.phone.cook_title', 'Cook it from your phone') : tt('health.phone.ex_title', 'Take it to the gym');
  const body = item.kind === 'recipe'
    ? (levelName
      ? tt('health.phone.cook_body_level', 'Opens {name} on your phone at {level}, your cooking level. Tap Cook it for one step at a time, with the screen kept on.').replace('{name}', item.name).replace('{level}', levelName)
      : tt('health.phone.cook_body', 'Opens {name} on your phone. Tap Cook it for one step at a time, with the screen kept on.').replace('{name}', item.name))
    : tt('health.phone.ex_body', 'Opens {name} on your phone: how to do it step by step, and the common mistakes to avoid.').replace('{name}', item.name);
  return (
    <PhoneQrDialog title={title} body={body} url={phoneUrl(item, cookingLevel)} waText={item.name}
      privacy={tt('health.phone.private', 'Just its public page. Nothing about you is in the link.')}
      onClose={onClose} onOpenUrl={onOpenUrl} />
  );
}

/** A plan day's training, to tick off at the gym (the session travels inside the link). */
export function SendWorkoutToPhone({ planId, day, date, onClose, onOpenUrl }: {
  planId: string;
  day: Parameters<typeof workoutFromDay>[0]['day'];
  date: string;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
}) {
  useLocale();
  const [url, setUrl] = useState<string | null>(null);
  const w = useMemo(() => workoutFromDay({ planId, day, date, fallbackTitle: tt('health.phone.training', 'Training') }), [planId, day, date]);
  useEffect(() => { let live = true; void sharedWorkoutUrl(w).then((u) => { if (live) setUrl(u); }); return () => { live = false; }; }, [w]);
  return (
    <PhoneQrDialog
      title={tt('health.phone.gym_title', 'Take today\u2019s session to the gym')}
      body={tt('health.phone.gym_body', '{title} opens on your phone: tick each set, rest timer between them. Works with no signal once it is open.').replace('{title}', w.title)}
      url={url} waText={w.title}
      privacy={tt('health.phone.gym_private', 'The session travels inside the code itself. Nothing is sent to us.')}
      onClose={onClose} onOpenUrl={onOpenUrl} />
  );
}

/** The button for a training day. */
export function GymButton({ onClick, style, className }: { onClick: () => void; style?: CSSProperties; className?: string }) {
  useLocale();
  return (
    <button type="button" onClick={onClick} style={style} className={className}>
      {tt('health.phone.gym', 'Take it to the gym')}
    </button>
  );
}
