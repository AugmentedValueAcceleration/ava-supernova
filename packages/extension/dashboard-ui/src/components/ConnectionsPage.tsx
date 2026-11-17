// Connections — his MCP servers (plan 2026-11-17-mcp-servers, Phases 2-3; mockup
// Decisions/mcp/connections-page-mockup.html, approved 17 Nov 2026).
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import line. Inline styles; each app passes its own plumbing in as
// `request(op, args)`, which runs core's mcpPage() on the host and resolves
// with its reply. What's shown is read from ~/.ava/mcp.json, the project's
// .mcp.json and the running servers, so the page and Ava can never disagree.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { tt } from '../i18n';

// ── Shapes (mirror core's mcp/page.ts) ────────────────────────────────────

type State = 'off' | 'waiting' | 'connecting' | 'ready' | 'needs-key' | 'needs-signin' | 'error';
type RiskCode = 'admin' | 'deletes' | 'download-run' | 'hidden' | 'keys-folder' | 'whole-home' | 'plain-secret' | 'latest' | 'online' | 'bad-url';
interface Note { code: RiskCode; detail?: string }
interface ToolRow { name: string; avaName: string; description: string; readOnly: boolean; allowed: boolean }
interface Server {
  id: string; scope: 'user' | 'project'; state: State; message?: string;
  reason?: 'new' | 'changed' | 'declined' | 'shadowed' | 'stopped' | 'signin';
  missing?: string[]; notes: Note[]; online: boolean; shows: string;
  tools: ToolRow[]; keys: Array<{ name: string; set: boolean }>; server?: { name: string; version: string };
  signedIn?: boolean; signingIn?: boolean;
}
interface PageState {
  servers: Server[]; projectFolder: string | null; problems: string[];
  toolsOn: number; serversOn: number; waiting: number; heavy: boolean; keychain: boolean;
}
type Check =
  | { ok: true; id: string; shows: string; notes: Note[]; replaces: boolean }
  | { ok: false; problem: 'name' | 'command' | 'url' | 'exists'; detail?: string };
interface Draft {
  name: string; kind: 'local' | 'online'; commandLine: string; keys: Array<{ name: string; value: string }>;
  url: string; headerName: string; headerValue: string;
}

export type ConnectionsRequest = (op: string, args?: Record<string, unknown>) => Promise<unknown>;

// ── Look (the Memory page's palette) ──────────────────────────────────────

const C = {
  text: 'var(--text-primary, #cdd6f4)', text2: 'var(--text-secondary, #a6adc8)', muted: 'var(--text-muted, #6c7086)',
  border: 'var(--border-card, rgba(168,85,247,0.12))', strong: 'rgba(168,85,247,0.28)', accent: 'var(--accent, #a855f7)',
  soft: 'rgba(168,85,247,0.12)', card: 'var(--bg-card, rgba(26,16,40,0.6))', input: 'var(--bg-input, rgba(49,34,68,0.5))',
  deep: 'rgba(0,0,0,0.2)', ok: '#34d399', warn: '#fbbf24', danger: '#f87171', online: '#93c5fd',
};
const mono = "'Cascadia Code', Consolas, 'SF Mono', monospace";
const card: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', margin: '10px 0' };
const btn: CSSProperties = { background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 8, padding: '5px 11px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const primary: CSSProperties = { ...btn, background: C.accent, borderColor: C.accent, color: '#fff' };
const yesBtn: CSSProperties = { ...btn, borderColor: 'rgba(52,211,153,0.4)', color: C.ok };
const noBtn: CSSProperties = { ...btn, color: C.danger };
const link: CSSProperties = { background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 12.5, padding: 0, fontFamily: 'inherit' };
const h2: CSSProperties = { fontSize: 13, fontWeight: 500, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '28px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' };
const hint: CSSProperties = { textTransform: 'none', letterSpacing: 0, color: C.muted, fontSize: 12, fontWeight: 400 };
const note: CSSProperties = { color: C.muted, fontSize: 12.5, marginTop: 6 };
const cmd: CSSProperties = { fontFamily: mono, fontSize: 12.5, background: C.deep, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, overflowX: 'auto', whiteSpace: 'pre', margin: '6px 0' };
const input: CSSProperties = { width: '100%', background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13.5, boxSizing: 'border-box' };
const label: CSSProperties = { display: 'block', fontSize: 12.5, color: C.text2, margin: '10px 0 4px' };
const acts: CSSProperties = { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' };
const chip = (color: string, border: string): CSSProperties => ({ border: `1px solid ${border}`, borderRadius: 999, padding: '0 8px', fontSize: 11.5, color, fontWeight: 400 });
const dot = (color: string, glow = false): CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: color, boxShadow: glow ? `0 0 6px ${color}` : 'none', flex: 'none' });

// ── Words ─────────────────────────────────────────────────────────────────

function riskText(n: Note): string {
  const d = n.detail ?? '';
  switch (n.code) {
    case 'admin': return tt('mcp.page.risk.admin', 'It asks for administrator rights.');
    case 'deletes': return tt('mcp.page.risk.deletes', 'It deletes files or folders.');
    case 'download-run': return tt('mcp.page.risk.download_run', 'It downloads a script and runs it.');
    case 'hidden': return tt('mcp.page.risk.hidden', 'It runs a hidden (encoded) command.');
    case 'keys-folder': return tt('mcp.page.risk.keys_folder', 'It can reach a folder with your SSH or cloud keys: {detail}').replace('{detail}', d);
    case 'whole-home': return tt('mcp.page.risk.whole_home', 'It can reach your whole home folder or drive ({detail}). A narrower folder is safer.').replace('{detail}', d);
    case 'plain-secret': return tt('mcp.page.risk.plain_secret', 'A key or password is written in plain text ({detail}). Keep it in your keychain instead.').replace('{detail}', d);
    case 'latest': return tt('mcp.page.risk.latest', 'It fetches the newest version of {detail} each time it starts.').replace('{detail}', d);
    case 'online': return tt('mcp.page.risk.online', 'What I give it is sent to {detail}.').replace('{detail}', d);
    case 'bad-url': return tt('mcp.page.risk.bad_url', "This address won't be used: a server that isn't on this computer needs https.");
  }
}
const SERIOUS: RiskCode[] = ['admin', 'deletes', 'download-run', 'hidden', 'keys-folder', 'whole-home', 'plain-secret', 'bad-url'];

function statusLine(s: Server): { color: string; glow?: boolean; text: string } {
  const n = s.tools.length;
  switch (s.state) {
    case 'ready': return { color: C.ok, glow: true, text: (s.online
      ? (n === 1 ? tt('mcp.page.status.connected_one', 'Connected · 1 tool') : tt('mcp.page.status.connected', 'Connected · {n} tools'))
      : (n === 1 ? tt('mcp.page.status.running_one', 'Running · 1 tool') : tt('mcp.page.status.running', 'Running · {n} tools'))).replace('{n}', String(n)) };
    case 'connecting': return { color: C.warn, text: tt('mcp.page.status.connecting', 'Starting…') };
    case 'waiting': return { color: C.warn, text: s.reason === 'changed'
      ? tt('mcp.page.status.changed', 'Its command changed since you said yes, so it waits for you again.')
      : tt('mcp.page.status.waiting', 'Waiting for your yes. A project can never turn on its own servers.') };
    case 'needs-key': return { color: C.warn, text: tt('mcp.page.status.needs_key', "It needs a key that isn't in your keychain yet.") };
    case 'needs-signin': return { color: C.warn, text: tt('mcp.page.status.needs_signin', 'It wants a sign-in, or its key was refused.') };
    case 'error': return { color: C.danger, text: s.reason === 'stopped' ? tt('mcp.page.status.stopped', 'It stopped.') : tt('mcp.page.status.error', "It couldn't start.") };
    case 'off': return { color: C.muted, text: s.reason === 'declined' ? tt('mcp.page.status.declined', 'You said never for this project.')
      : s.reason === 'shadowed' ? tt('mcp.page.status.shadowed', "One of your own servers has the same name, so this one isn't used.")
      : tt('mcp.page.status.off', 'Off') };
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Switch({ on, onChange, title }: { on: boolean; onChange: (on: boolean) => void; title: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} title={title} onClick={() => onChange(!on)}
      style={{ position: 'relative', width: 38, height: 22, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 0,
        background: on ? C.accent : C.input, border: `1px solid ${on ? C.accent : C.strong}` }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: on ? '#fff' : C.text2, transition: 'left .15s' }} />
    </button>
  );
}

function Notes({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <div style={{ margin: '6px 0' }}>
      {notes.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: SERIOUS.includes(n.code) ? C.warn : C.text2, margin: '3px 0' }}>
          <span aria-hidden>{SERIOUS.includes(n.code) ? '⚠' : 'ℹ'}</span><span>{riskText(n)}</span>
        </div>
      ))}
    </div>
  );
}

function KeyRow({ k, request, onState }: { k: { name: string; set: boolean }; request: ConnectionsRequest; onState: (s: PageState) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const save = async (v: string) => {
    onState(await request('set_key', { name: k.name, value: v }) as PageState);
    setEditing(false); setValue('');
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.text2, marginTop: 6, flexWrap: 'wrap' }}>
      <span aria-hidden>🔑</span>
      <code style={{ color: C.text, fontFamily: mono }}>{k.name}</code>
      <span style={{ color: k.set ? C.ok : C.warn }}>{k.set ? tt('mcp.page.key.kept', 'kept in your keychain') : tt('mcp.page.key.missing', 'not set')}</span>
      {editing ? (
        <>
          <input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ ...input, width: 240, padding: '4px 8px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && value) void save(value); if (e.key === 'Escape') setEditing(false); }} />
          <button style={primary} disabled={!value} onClick={() => void save(value)}>{tt('mcp.page.save', 'Save')}</button>
          <button style={btn} onClick={() => setEditing(false)}>{tt('mcp.page.cancel', 'Cancel')}</button>
        </>
      ) : (
        <>
          <button style={link} onClick={() => setEditing(true)}>{k.set ? tt('mcp.page.key.change', 'Change') : tt('mcp.page.key.set', 'Set it')}</button>
          {k.set && <button style={{ ...link, color: C.danger }} onClick={() => void save('')}>{tt('mcp.page.key.forget', 'Forget')}</button>}
        </>
      )}
    </div>
  );
}

function ServerCard({ s, request, onState }: { s: Server; request: ConnectionsRequest; onState: (st: PageState) => void }) {
  const [open, setOpen] = useState(s.state === 'needs-key' || s.state === 'error');
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signInProblem, setSignInProblem] = useState('');
  const run = async (op: string, args: Record<string, unknown>) => {
    setBusy(true);
    try { onState(await request(op, args) as PageState); } finally { setBusy(false); }
  };
  // Opens his browser on the server's sign-in page; the page's polling shows the rest.
  const signIn = async () => {
    setBusy(true); setSignInProblem('');
    try {
      const r = await request('sign_in', { scope: s.scope, id: s.id, words: {
        done: tt('mcp.page.signin_done', 'Signed in. You can close this tab and go back to Ava.'),
        failed: tt('mcp.page.signin_failed', "Sign-in didn't finish. You can close this tab and try again from Ava."),
      } }) as { problem?: string; state: PageState };
      if (r.problem) setSignInProblem(r.problem);
      onState(r.state);
    } catch (e) {
      setSignInProblem(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const st = statusLine(s);
  const waiting = s.state === 'waiting';
  const off = s.state === 'off';
  return (
    <div style={{ ...card, ...(waiting ? { border: '1px solid rgba(251,191,36,0.35)' } : {}), ...(off ? { opacity: 0.65 } : {}) }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 15, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: C.text }}>
            {s.id}
            {s.online
              ? <span style={chip(C.online, 'rgba(96,165,250,0.35)')}>{tt('mcp.page.online', 'Online')}</span>
              : <span style={chip(C.ok, 'rgba(52,211,153,0.3)')}>{tt('mcp.page.local', 'On this computer')}</span>}
            {s.server && s.state === 'ready' && <span style={{ color: C.muted, fontSize: 12, fontWeight: 400 }}>{s.server.name} {s.server.version}</span>}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 3, color: C.text2, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={dot(st.color, st.glow)} /> <span>{st.text}</span>
          </div>
          {s.online && s.signingIn && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12.5, color: C.text2, flexWrap: 'wrap' }}>
              <span>{tt('mcp.page.signing_in', 'Finish signing in in your browser…')}</span>
              <button style={btn} onClick={() => void run('cancel_signin', { scope: s.scope, id: s.id })}>{tt('mcp.page.cancel', 'Cancel')}</button>
            </div>
          )}
          {s.online && s.state === 'needs-signin' && !s.signingIn && (
            <div style={{ marginTop: 8 }}>
              <button style={primary} disabled={busy} onClick={() => void signIn()}>{tt('mcp.page.signin', 'Sign in')}</button>
            </div>
          )}
          {signInProblem && !s.signingIn && (
            <div style={{ ...note, color: C.danger }}>{tt('mcp.page.signin_error', "Sign-in couldn't start: {detail}").replace('{detail}', signInProblem)}</div>
          )}
        </div>
        {!waiting && <button style={link} onClick={() => setOpen(!open)}>{tt('mcp.page.details', 'Tools & details')}</button>}
        {s.scope === 'user' && (
          <Switch on={s.state !== 'off'} title={s.state !== 'off' ? tt('mcp.page.switch_off', 'Switch off') : tt('mcp.page.switch_on', 'Switch on')}
            onChange={(on) => void run('enable', { id: s.id, on })} />
        )}
      </div>

      {(open || waiting) && (
        <div style={{ marginTop: 12, borderTop: waiting ? 'none' : `1px solid ${C.border}`, paddingTop: waiting ? 0 : 10 }}>
          <div style={note}>{s.online ? tt('mcp.page.address', 'Address') : waiting ? tt('mcp.page.command_wants', 'The exact command it wants to run') : tt('mcp.page.command', 'The exact command I run')}</div>
          <div style={cmd}>{s.shows}</div>
          <Notes notes={s.notes} />
          {s.keys.map((k) => <KeyRow key={k.name} k={k} request={request} onState={onState} />)}
          {(s.state === 'error' || s.state === 'needs-signin') && s.message && (
            <>
              <div style={note}>{tt('mcp.page.it_said', 'What it said')}</div>
              <div style={{ ...cmd, whiteSpace: 'pre-wrap', color: C.text2 }}>{s.message}</div>
            </>
          )}
          {s.state === 'ready' && s.tools.length > 0 && (
            <>
              <div style={note}>{tt('mcp.page.tools_hint', 'Tools · each asks the first time; "Always" means I stop asking')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 13, marginTop: 6, alignItems: 'center' }}>
                {s.tools.map((t) => (
                  <ToolLine key={t.avaName} t={t} onAllow={(on) => void run('allow', { avaName: t.avaName, on })} />
                ))}
              </div>
            </>
          )}
          <div style={acts}>
            {waiting ? (
              <>
                <button style={yesBtn} disabled={busy} onClick={() => void run('answer', { id: s.id, answer: 'yes' })}>{tt('mcp.page.yes_project', 'Yes, for this project')}</button>
                <button style={btn} disabled={busy} onClick={() => void run('answer', { id: s.id, answer: 'not-now' })}>{tt('mcp.page.not_now', 'Not now')}</button>
                <button style={noBtn} disabled={busy} onClick={() => void run('answer', { id: s.id, answer: 'never' })}>{tt('mcp.page.never_project', 'Never for this project')}</button>
              </>
            ) : (
              <>
                {s.state !== 'off' && <button style={btn} disabled={busy} onClick={() => void run('restart', { scope: s.scope, id: s.id })}>{tt('mcp.page.restart', 'Restart')}</button>}
                {s.online && s.signedIn && <button style={btn} disabled={busy} onClick={() => void run('sign_out', { scope: s.scope, id: s.id })}>{tt('mcp.page.signout', 'Sign out')}</button>}
                {s.scope === 'project' && s.reason !== 'shadowed' && (
                  s.state === 'off'
                    ? <button style={btn} disabled={busy} onClick={() => void run('answer', { id: s.id, answer: 'not-now' })}>{tt('mcp.page.ask_again', 'Ask me again')}</button>
                    : <button style={btn} disabled={busy} onClick={() => void run('answer', { id: s.id, answer: 'not-now' })}>{tt('mcp.page.stop_here', 'Stop using it here')}</button>
                )}
                {s.scope === 'user' && (removing ? (
                  <>
                    <span style={{ fontSize: 12.5, color: C.text2 }}>{tt('mcp.page.remove_confirm', 'Remove {name} and forget its keys?').replace('{name}', s.id)}</span>
                    <button style={noBtn} disabled={busy} onClick={() => void run('remove', { id: s.id })}>{tt('mcp.page.remove', 'Remove')}</button>
                    <button style={btn} onClick={() => setRemoving(false)}>{tt('mcp.page.cancel', 'Cancel')}</button>
                  </>
                ) : (
                  <button style={noBtn} onClick={() => setRemoving(true)}>{tt('mcp.page.remove', 'Remove')}</button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolLine({ t, onAllow }: { t: ToolRow; onAllow: (on: boolean) => void }) {
  const seg = (on: boolean, always: boolean): CSSProperties => ({
    padding: '1px 9px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 11.5,
    background: on ? C.soft : 'transparent', color: on ? (always ? C.ok : C.text) : C.muted,
  });
  return (
    <>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 12.5, color: C.text }}>{t.name}</span>
        {t.description && <span style={{ color: C.muted, fontSize: 12 }}> — {t.description.length > 110 ? `${t.description.slice(0, 110)}…` : t.description}</span>}
      </div>
      <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 999, overflow: 'hidden' }}>
        <button style={seg(!t.allowed, false)} onClick={() => t.allowed && onAllow(false)}>{tt('mcp.page.asks', 'Asks')}</button>
        <button style={seg(t.allowed, true)} onClick={() => !t.allowed && onAllow(true)}>{tt('mcp.page.always', 'Always')}</button>
      </div>
    </>
  );
}

const EMPTY_DRAFT: Draft = { name: '', kind: 'local', commandLine: '', keys: [], url: '', headerName: 'Authorization', headerValue: '' };

function AddPanel({ request, onClose, onState }: { request: ConnectionsRequest; onClose: () => void; onState: (s: PageState) => void }) {
  const [d, setD] = useState<Draft>(EMPTY_DRAFT);
  const [checked, setChecked] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setChecked(null); };
  const draftArgs = () => ({ draft: d.kind === 'local'
    ? { name: d.name, kind: 'local', commandLine: d.commandLine, keys: d.keys.filter((k) => k.name.trim() || k.value) }
    : { name: d.name, kind: 'online', url: d.url, headerName: d.headerName, headerValue: d.headerValue } });
  const check = async () => { setBusy(true); try { setChecked(await request('check', draftArgs()) as Check); } finally { setBusy(false); } };
  const add = async () => {
    setBusy(true);
    try {
      const r = await request('add', draftArgs()) as { ok: boolean; state?: PageState };
      if (r.ok && r.state) { onState(r.state); onClose(); }
    } finally { setBusy(false); }
  };
  const problem = checked && !checked.ok ? ({
    name: tt('mcp.page.add.problem_name', 'Give it a name.'),
    command: checked.detail
      ? tt('mcp.page.add.problem_key_name', '"{detail}" can\'t be a key name: letters, digits and _ only.').replace('{detail}', checked.detail)
      : tt('mcp.page.add.problem_command', 'Type the command that starts it.'),
    url: tt('mcp.page.add.problem_url', 'That address won\'t work: use https (plain http only for a server on this computer).'),
    exists: tt('mcp.page.add.problem_exists', 'You already have a server with that name.'),
  })[checked.problem] : null;
  const seg = (on: boolean): CSSProperties => ({ padding: '5px 12px', cursor: 'pointer', fontSize: 13, border: 'none', fontFamily: 'inherit', background: on ? C.soft : 'transparent', color: on ? C.text : C.text2 });

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 50, zIndex: 50 }}>
      <div role="dialog" aria-label={tt('mcp.page.add.title', 'Add a server')}
        style={{ width: 'min(640px, 92vw)', background: '#1a1028', border: `1px solid ${C.strong}`, borderRadius: 14, padding: '18px 20px', maxHeight: '84vh', overflow: 'auto', color: C.text }}>
        <div style={{ fontWeight: 500, fontSize: 17 }}>{tt('mcp.page.add.title', 'Add a server')}</div>
        <div style={{ ...note, marginTop: 2 }}>{tt('mcp.page.add.intro', 'A server is a program or a website that gives me more tools. It runs as you, so you see exactly what runs first.')}</div>

        <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
          <button style={seg(d.kind === 'local')} onClick={() => set({ kind: 'local' })}>{tt('mcp.page.local', 'On this computer')}</button>
          <button style={seg(d.kind === 'online')} onClick={() => set({ kind: 'online' })}>{tt('mcp.page.online', 'Online')}</button>
        </div>

        <label style={label}>{tt('mcp.page.add.name', 'Name')}</label>
        <input style={input} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="github" />

        {d.kind === 'local' ? (
          <>
            <label style={label}>{tt('mcp.page.add.command', 'Command')}</label>
            <input style={{ ...input, fontFamily: mono, fontSize: 12.5 }} value={d.commandLine} onChange={(e) => set({ commandLine: e.target.value })}
              placeholder="npx -y @modelcontextprotocol/server-filesystem C:\Users\you\Documents" />
            <label style={label}>{tt('mcp.page.add.keys', 'Keys it needs (kept in your keychain, never in the file)')}</label>
            {d.keys.map((k, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input style={{ ...input, fontFamily: mono, fontSize: 12.5, flex: '0 0 40%' }} value={k.name} placeholder="API_KEY"
                  onChange={(e) => set({ keys: d.keys.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input type="password" style={input} value={k.value} placeholder={tt('mcp.page.add.value', 'Value')}
                  onChange={(e) => set({ keys: d.keys.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button style={btn} aria-label={tt('mcp.page.remove', 'Remove')} onClick={() => set({ keys: d.keys.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button style={link} onClick={() => set({ keys: [...d.keys, { name: '', value: '' }] })}>{tt('mcp.page.add.add_key', '+ Add a key')}</button>
          </>
        ) : (
          <>
            <label style={label}>{tt('mcp.page.add.url', 'Address')}</label>
            <input style={{ ...input, fontFamily: mono, fontSize: 12.5 }} value={d.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/mcp" />
            <label style={label}>{tt('mcp.page.add.header', 'A key, if it needs one (kept in your keychain)')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...input, fontFamily: mono, fontSize: 12.5, flex: '0 0 40%' }} value={d.headerName} onChange={(e) => set({ headerName: e.target.value })} placeholder="Authorization" />
              <input type="password" style={input} value={d.headerValue} onChange={(e) => set({ headerValue: e.target.value })} placeholder={tt('mcp.page.add.value', 'Value')} />
            </div>
            <div style={note}>{tt('mcp.page.add.signin_hint', "If it uses a sign-in instead of a key, leave this empty: a Sign in button shows once it's added.")}</div>
          </>
        )}

        {problem && <div style={{ ...note, color: C.danger }}>{problem}</div>}

        {checked?.ok && (
          <div style={{ marginTop: 14 }}>
            <div style={note}>{d.kind === 'online' ? tt('mcp.page.address', 'Address') : tt('mcp.page.command', 'The exact command I run')}</div>
            <div style={cmd}>{checked.shows}</div>
            <Notes notes={checked.notes} />
            {checked.replaces && <div style={{ ...note, color: C.warn }}>{tt('mcp.page.add.replaces', 'You already have a server called {name}: this replaces it.').replace('{name}', checked.id)}</div>}
          </div>
        )}

        <div style={{ border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: C.text2, marginTop: 14 }}>
          <b style={{ color: C.warn, fontWeight: 500 }}>{tt('mcp.page.add.before', 'Before it runs:')}</b>{' '}
          {d.kind === 'online'
            ? tt('mcp.page.add.before_online', 'what I give its tools is sent to that address. Add servers you trust.')
            : tt('mcp.page.add.before_local', 'this starts a program on your computer, with your rights. Check the exact command above.')}
        </div>

        <div style={acts}>
          {checked?.ok
            ? <button style={primary} disabled={busy} onClick={() => void add()}>{tt('mcp.page.add.add', 'Add it')}</button>
            : <button style={primary} disabled={busy} onClick={() => void check()}>{tt('mcp.page.add.check', 'Check it')}</button>}
          <button style={btn} onClick={onClose}>{tt('mcp.page.cancel', 'Cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────────

export function ConnectionsPage({ request, onWaitingChange }: { request: ConnectionsRequest; onWaitingChange?: (n: number) => void }) {
  const [st, setSt] = useState<PageState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const alive = useRef(true);
  const show = useCallback((s: PageState) => {
    if (!alive.current) return;
    setSt(s); setFailed(null);
    onWaitingChange?.(s.waiting);
  }, [onWaitingChange]);

  useEffect(() => {
    alive.current = true;
    const load = () => request('state').then((s) => show(s as PageState)).catch((e) => alive.current && setFailed(String(e?.message ?? e)));
    void load();
    // Servers start and stop on their own (and the other app can change the
    // file), so the page keeps up while it's open.
    const timer = setInterval(load, 2500);
    return () => { alive.current = false; clearInterval(timer); };
  }, [request, show]);

  const mine = st?.servers.filter((s) => s.scope === 'user') ?? [];
  const project = st?.servers.filter((s) => s.scope === 'project') ?? [];
  const folderName = st?.projectFolder ? st.projectFolder.split(/[\\/]/).filter(Boolean).pop() : null;

  let body: ReactNode;
  if (!st) {
    body = <div style={note}>{failed ? tt('mcp.page.failed', "Your servers couldn't be read: {error}").replace('{error}', failed) : tt('mcp.page.loading', 'Reading your servers…')}</div>;
  } else {
    body = (
      <>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, color: C.text2, fontSize: 13 }}>
            <b style={{ color: C.text, fontWeight: 500 }}>{(st.serversOn === 1 ? tt('mcp.page.summary_on_one', '1 server on') : tt('mcp.page.summary_on', '{n} servers on')).replace('{n}', String(st.serversOn))}</b>
            {' · '}{(st.toolsOn === 1 ? tt('mcp.page.summary_tools_one', '1 tool') : tt('mcp.page.summary_tools', '{n} tools')).replace('{n}', String(st.toolsOn))}
            {st.waiting > 0 && <>{' · '}{tt('mcp.page.summary_waiting', '{n} waiting for your yes').replace('{n}', String(st.waiting))}</>}
          </div>
          <button style={primary} onClick={() => setAdding(true)}>{tt('mcp.page.add_button', '+ Add a server')}</button>
        </div>

        {st.heavy && (
          <div style={{ marginTop: 12, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)', color: C.warn, borderRadius: 10, padding: '9px 12px', fontSize: 13 }}>
            {tt('mcp.page.heavy', 'That\'s {n} tools from your servers. Every tool takes space in each message, so switch off the servers you aren\'t using.').replace('{n}', String(st.toolsOn))}
          </div>
        )}
        {!st.keychain && <div style={{ ...note, color: C.warn }}>{tt('mcp.page.no_keychain', "The keychain can't be reached, so keys can't be kept right now.")}</div>}
        {st.problems.map((p, i) => <div key={i} style={{ ...note, color: C.danger }}>{p}</div>)}

        <div style={h2}>
          <span>{tt('mcp.page.yours', 'Your servers')}</span>
          <span style={hint}>{tt('mcp.page.yours_hint', 'Yours, in every project · saved in ~/.ava/mcp.json')}</span>
        </div>
        {mine.length === 0 && <div style={{ ...note, fontSize: 13 }}>{tt('mcp.page.empty', 'No servers yet. Add one to give me more tools: your GitHub, your files, your other apps.')}</div>}
        {mine.map((s) => <ServerCard key={`u:${s.id}`} s={s} request={request} onState={show} />)}

        <div style={note}>{tt('mcp.page.blender_note', "Blender (MCP) is set up and switched in the Design Studio's Blender room.")}</div>

        {project.length > 0 && (
          <>
            <div style={h2}>
              <span>{tt('mcp.page.project', "This project's servers")}</span>
              <span style={hint}>{tt('mcp.page.project_hint', "From the project's own .mcp.json · {folder}").replace('{folder}', folderName ?? '')}</span>
            </div>
            {project.map((s) => <ServerCard key={`p:${s.id}`} s={s} request={request} onState={show} />)}
          </>
        )}
      </>
    );
  }

  return (
    <div style={{ padding: '26px 32px 80px', maxWidth: 1000, color: C.text }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px' }}>{tt('dash.nav.connections', 'Connections')}</h1>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 18 }}>{tt('mcp.page.subtitle', 'MCP servers give me more tools: your GitHub, your files, your other apps. Nothing here runs until you say yes.')}</div>
      {body}
      {adding && <AddPanel request={request} onClose={() => setAdding(false)} onState={show} />}
    </div>
  );
}
