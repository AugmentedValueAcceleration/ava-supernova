// Connections — his MCP servers (plan 2026-11-17-mcp-servers, Phases 2-4; mockup
// Decisions/mcp/connections-page-mockup.html, approved 17 Nov 2026).
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import line. Inline styles; each app passes its own plumbing in as
// `request(op, args)`, which runs core's mcpPage() on the host and resolves
// with its reply. What's shown is read from ~/.ava/mcp.json, the project's
// .mcp.json and the running servers, so the page and Ava can never disagree.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { tt } from '../i18n';

// ── Shapes (mirror core's mcp/page.ts) ────────────────────────────────────

type State = 'off' | 'waiting' | 'connecting' | 'ready' | 'needs-key' | 'needs-signin' | 'error';
type RiskCode = 'admin' | 'deletes' | 'download-run' | 'hidden' | 'keys-folder' | 'whole-home' | 'plain-secret' | 'latest' | 'online' | 'bad-url';
interface Note { code: RiskCode; detail?: string }
interface ToolRow { name: string; avaName: string; description: string; readOnly: boolean; allowed: boolean }
interface Server {
  id: string; scope: 'user' | 'project'; state: State; message?: string;
  reason?: 'new' | 'changed' | 'declined' | 'shadowed' | 'stopped' | 'signin' | 'unreal-closed' | 'unreal-old';
  missing?: string[]; notes: Note[]; online: boolean; shows: string;
  /** Unreal Engine's server: the Unreal tools Ava knows, toolsets off, and his "always" ones (Toolset.Tool). */
  unreal?: { tools: number; toolsetsOff: boolean; labelled?: boolean; assistantPanel?: boolean; allowed: string[]; asked?: string[] };
  /** Unreal can't be reached but an editor is running: its version and project (its MCP server is off). */
  unrealOff?: { version?: string; project?: string };
  tools: ToolRow[]; keys: Array<{ name: string; set: boolean }>; server?: { name: string; version: string };
  signedIn?: boolean; signingIn?: boolean;
  ava?: { view?: string; registry?: string; repository?: string; from?: string };
  docs?: string;
}
interface Suggestion { id: string; name: string; publisher: string; registry?: string; kind: 'open' | 'signin' | 'key' | 'local'; url: string; docs: string; added: boolean; what: string; view: string }
interface PageState {
  servers: Server[]; projectFolder: string | null; problems: string[];
  toolsOn: number; serversOn: number; waiting: number; heavy: boolean; keychain: boolean;
  suggested?: Suggestion[];
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
const opinion: CSSProperties = { background: C.soft, borderLeft: `2px solid ${C.accent}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, color: C.text2, marginTop: 10 };
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

/** A server at a web address on this computer (Unreal's) isn't "Online". */
const onThisComputer = (s: { online: boolean; shows: string }) =>
  !s.online || /^https?:\/\/(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?(\/|$)/i.test(s.shows);

function statusLine(s: Server): { color: string; glow?: boolean; text: string } {
  const n = s.tools.length;
  switch (s.state) {
    case 'ready': if (s.unreal) {
      return { color: C.ok, glow: true, text: tt('mcp.page.status.unreal_ready', 'Connected · {n} Unreal tools').replace('{n}', String(s.unreal.tools)) };
    }
    return { color: C.ok, glow: true, text: (s.online
      ? (n === 1 ? tt('mcp.page.status.connected_one', 'Connected · 1 tool') : tt('mcp.page.status.connected', 'Connected · {n} tools'))
      : (n === 1 ? tt('mcp.page.status.running_one', 'Running · 1 tool') : tt('mcp.page.status.running', 'Running · {n} tools'))).replace('{n}', String(n)) };
    case 'connecting': return { color: C.warn, text: tt('mcp.page.status.connecting', 'Starting…') };
    case 'waiting': return { color: C.warn, text: s.reason === 'changed'
      ? tt('mcp.page.status.changed', 'Its command changed since you said yes, so it waits for you again.')
      : tt('mcp.page.status.waiting', 'Waiting for your yes. A project can never turn on its own servers.') };
    case 'needs-key': return { color: C.warn, text: tt('mcp.page.status.needs_key', "It needs a key that isn't in your keychain yet.") };
    case 'needs-signin': return { color: C.warn, text: tt('mcp.page.status.needs_signin', 'It wants a sign-in, or its key was refused.') };
    case 'error': return s.reason === 'unreal-closed' && s.unrealOff
      ? { color: C.warn, text: (s.unrealOff.project
          ? tt('mcp.page.status.unreal_off_project', 'Unreal {version} is open with {project}, but its MCP server is off. The steps below switch it on.').replace('{project}', s.unrealOff.project)
          : tt('mcp.page.status.unreal_off', 'Unreal {version} is open, but its MCP server is off. The steps below switch it on.')).replace('{version}', s.unrealOff.version ?? '') }
      : s.reason === 'unreal-closed'
      ? { color: C.muted, text: tt('mcp.page.status.unreal_closed', "Unreal Editor isn't open, or its MCP server is off. Open your project in Unreal (in 5.8, tick Auto Start Server under Editor Preferences → General → Model Context Protocol), then press Restart.") }
      : s.reason === 'unreal-old'
      ? { color: C.warn, text: tt('mcp.page.status.unreal_old', 'This Unreal Editor is older than 5.8. I work with Unreal Engine 5.8 and later.') }
      : { color: C.danger, text: s.reason === 'stopped' ? tt('mcp.page.status.stopped', 'It stopped.') : tt('mcp.page.status.error', "It couldn't start.") };
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
            {/* "Unreal MCP", his name for it (20 Nov); the id stays "unreal" so its saved "Always" choices keep working. */}
            {isUnrealCard(s) || s.id === 'unreal' ? 'Unreal MCP' : s.id}
            {!onThisComputer(s)
              ? <span style={chip(C.online, 'rgba(96,165,250,0.35)')}>{tt('mcp.page.online', 'Online')}</span>
              : <span style={chip(C.ok, 'rgba(52,211,153,0.3)')}>{tt('mcp.page.local', 'On this computer')}</span>}
            {s.server && s.state === 'ready' && <span style={{ color: C.muted, fontSize: 12, fontWeight: 400 }}>{s.server.name} {s.server.version}</span>}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 3, color: C.text2, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={dot(st.color, st.glow)} /> <span>{st.text}</span>
          </div>
          {s.state === 'error' && s.reason === 'unreal-closed' && <UnrealSetup request={request} />}
          {s.state === 'ready' && s.unreal?.toolsetsOff && (
            <div style={{ ...note, color: C.warn }}>{tt('mcp.page.unreal.toolsets_off', "Most of Unreal's tools are switched off in this project. In Unreal, open Edit → Plugins, turn on All Toolsets, then restart the editor.")}</div>
          )}
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
        {s.docs && <button style={btn} title={s.docs} onClick={() => void request('open_docs', { url: s.docs })}>{tt('mcp.page.docs', 'Docs')}</button>}
        {s.scope === 'user' && !removing && <button style={noBtn} onClick={() => setRemoving(true)}>{tt('mcp.page.remove', 'Remove')}</button>}
        {s.scope === 'user' && (
          <Switch on={s.state !== 'off'} title={s.state !== 'off' ? tt('mcp.page.switch_off', 'Switch off') : tt('mcp.page.switch_on', 'Switch on')}
            onChange={(on) => void run('enable', { id: s.id, on })} />
        )}
      </div>
      {s.scope === 'user' && removing && (
        <div style={{ ...acts, marginTop: 8 }}>
          <span style={{ fontSize: 12.5, color: C.text2 }}>{tt('mcp.page.remove_confirm', 'Remove {name} and forget its keys?').replace('{name}', s.id)}</span>
          <button style={noBtn} disabled={busy} onClick={() => void run('remove', { id: s.id })}>{tt('mcp.page.remove', 'Remove')}</button>
          <button style={btn} onClick={() => setRemoving(false)}>{tt('mcp.page.cancel', 'Cancel')}</button>
        </div>
      )}

      {s.ava?.view && (
        <div style={opinion}><b style={{ color: C.text, fontWeight: 500 }}>{tt('mcp.page.my_view', 'My view:')}</b> {
          // Unreal's view is read live, in his language: the copy saved when it
          // was added goes stale (it still said "5.9 and later" on 20 Nov).
          isUnrealCard(s) || s.id === 'unreal' ? tt('mcp.suggest.unreal.view', s.ava.view) : s.ava.view
        }</div>
      )}

      {s.scope === 'user' && isUnrealCard(s) && s.unreal?.assistantPanel !== false && <UnrealPanelSetup request={request} />}
      {s.state === 'ready' && (s.unreal?.asked?.length ?? 0) > 0 && (
        <UnrealAsked asked={s.unreal!.asked!} busy={busy} onAlways={(inner) => {
          const call = s.tools.find((t) => t.name === 'call_tool');
          if (call) void run('allow', { avaName: call.avaName, on: true, inner });
        }} />
      )}

      {(open || waiting) && (
        <div style={{ marginTop: 12, borderTop: waiting ? 'none' : `1px solid ${C.border}`, paddingTop: waiting ? 0 : 10 }}>
          <div style={note}>{s.online ? tt('mcp.page.address', 'Address') : waiting ? tt('mcp.page.command_wants', 'The exact command it wants to run') : tt('mcp.page.command', 'The exact command I run')}</div>
          <div style={cmd}>{s.shows}</div>
          <Notes notes={s.notes} />
          {s.ava?.from && <div style={note}>{tt('mcp.page.from', 'Brought in from {app}').replace('{app}', s.ava.from)}</div>}
          {s.keys.map((k) => <KeyRow key={k.name} k={k} request={request} onState={onState} />)}
          {(s.state === 'error' || s.state === 'needs-signin') && s.message && s.reason !== 'unreal-closed' && s.reason !== 'unreal-old' && (
            <>
              <div style={note}>{tt('mcp.page.it_said', 'What it said')}</div>
              <div style={{ ...cmd, whiteSpace: 'pre-wrap', color: C.text2 }}>{s.message}</div>
            </>
          )}
          {s.state === 'ready' && s.unreal && (
            <UnrealTools s={s} busy={busy} onAskAgain={(inner) => {
              const call = s.tools.find((t) => t.name === 'call_tool');
              if (call) void run('allow', { avaName: call.avaName, on: false, inner });
            }} />
          )}
          {s.state === 'ready' && !s.unreal && s.tools.length > 0 && (
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Setting up Unreal, by the versions on this computer (his call, 20 Nov 2026):
 * 5.8 is what Ava offers until 5.9's full release; 5.9's steps show only to
 * someone who has 5.9 (it works, but isn't advertised). Versions come from the
 * Epic Games Launcher's list and any editor running (core unreal-local.ts).
 */
function UnrealSetup({ request }: { request: ConnectionsRequest }) {
  const [info, setInfo] = useState<{ installed: string[]; running: Array<{ version?: string; project?: string }> } | null>(null);
  useEffect(() => {
    let live = true;
    request('unreal_setup')
      .then((r) => { if (live) setInfo(r as { installed: string[]; running: Array<{ version?: string; project?: string }> }); })
      .catch(() => { if (live) setInfo({ installed: [], running: [] }); });
    return () => { live = false; };
    // Once per card: each look starts a small PowerShell lookup on Windows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!info) return null;
  const num = (v: string) => v.split('.').map(Number);
  const atLeast = (v: string, min: string) => { const [a, b] = [num(v), num(min)]; return a[0] > b[0] || (a[0] === b[0] && (a[1] ?? 0) >= (b[1] ?? 0)); };
  const versions = [...new Set([...info.installed, ...info.running.map((r) => r.version).filter((v): v is string => !!v)])];
  const has59 = versions.some((v) => atLeast(v, '5.9'));
  const has58 = versions.some((v) => atLeast(v, '5.8') && !atLeast(v, '5.9'));
  const old = versions.filter((v) => !atLeast(v, '5.8'));
  const nothing = !has58 && !has59;
  const step: CSSProperties = { margin: '4px 0 0 18px', padding: 0 };
  return (
    <div style={{ ...note, marginTop: 10 }}>
      <div style={{ fontWeight: 500, color: C.text }}>{tt('mcp.unreal.setup.title', 'Setting up Unreal')}</div>
      {nothing && old.length > 0 && <div style={{ marginTop: 4, color: C.warn }}>{tt('mcp.unreal.setup.old', 'Unreal {versions} is older than 5.8: I work with Unreal Engine 5.8 and later.').replace('{versions}', old.join(', '))}</div>}
      {nothing && old.length === 0 && <div style={{ marginTop: 4 }}>{tt('mcp.unreal.setup.none', "I couldn't find Unreal Engine installed through the Epic Games Launcher. I work with Unreal Engine 5.8 and later.")}</div>}
      {(has58 || nothing) && (
        <>
          <div style={{ marginTop: 6, color: C.text2 }}>Unreal Engine 5.8</div>
          <ol style={step}>
            <li>{tt('mcp.unreal.setup.s58_plugins', 'Edit → Plugins: tick Unreal MCP and All Toolsets.')}</li>
            <li>{tt('mcp.unreal.setup.s58_autostart', "Edit → Editor Preferences → General → Model Context Protocol: tick Auto Start Server (it's off in 5.8).")}</li>
            <li>{tt('mcp.unreal.setup.restart', 'Restart Unreal with your project open. I connect by myself once its server is on.')}</li>
          </ol>
        </>
      )}
      {has59 && (
        <>
          <div style={{ marginTop: 6, color: C.text2 }}>Unreal Engine 5.9</div>
          <ol style={step}>
            <li>{tt('mcp.unreal.setup.s59_plugins', 'Edit → Plugins: tick All Toolsets (Unreal MCP is on already).')}</li>
            <li>{tt('mcp.unreal.setup.s59_server', "Its MCP server starts with the editor, so there's nothing to switch on.")}</li>
            <li>{tt('mcp.unreal.setup.restart', 'Restart Unreal with your project open. I connect by myself once its server is on.')}</li>
          </ol>
        </>
      )}
    </div>
  );
}

const isUnrealCard = (s: Server) =>
  !!s.unreal || s.server?.name === 'unreal-mcp' || s.reason === 'unreal-closed' || s.reason === 'unreal-old';

interface UnrealPanel {
  supported: boolean; canInstall: boolean; installed: boolean; current: boolean; downloadsNode: boolean;
  command: string; args: string[];
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ ...cmd, flex: 1, minWidth: 0 }}>{text}</div>
      <button style={btn} onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
      }}>{copied ? tt('mcp.unreal_panel.copied', 'Copied') : tt('mcp.unreal_panel.copy', 'Copy')}</button>
    </div>
  );
}

/**
 * Ava in Unreal Editor's Assistant panel (plan 2026-11-18-unreal, Phase 2):
 * puts Ava.exe and her program in ~/.ava/bin (core mcp/unreal-install.ts) and
 * shows the steps in Unreal, with the two things to paste. Kimodo's own setup
 * is one optional line here — it needs Meta's approval, so it can't block this
 * (his call, 18 Nov); Ava walks him through it when he asks.
 */
function UnrealPanelSetup({ request }: { request: ConnectionsRequest }) {
  const [p, setP] = useState<UnrealPanel | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { void request('unreal_panel').then((r) => setP(r as UnrealPanel)).catch(() => {}); }, [request]);
  if (!p?.supported) return null;
  const setUp = async () => {
    setBusy(true); setProblem('');
    try {
      const r = await request('unreal_panel_install') as { ok: boolean; problem?: string; panel: UnrealPanel };
      setP(r.panel);
      if (r.ok) setOpen(true); else setProblem(r.problem ?? '');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const step: CSSProperties = { fontSize: 13, color: C.text2, margin: '10px 0 2px' };
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, color: C.text, fontWeight: 500 }}>{tt('mcp.unreal_panel.title', "Ava in Unreal's Assistant panel")}</div>
          <div style={note}>{p.installed && p.current
            ? tt('mcp.unreal_panel.ready', "Set up. Chat with me inside Unreal Editor, beside your project — same memory, same keys.")
            : p.installed
              ? tt('mcp.unreal_panel.update_ready', 'An update for Ava in Unreal is ready.')
              : tt('mcp.unreal_panel.what', "Chat with me inside Unreal Editor, beside your project — same memory, same keys.")}</div>
          {p.downloadsNode && (!p.installed || !p.current) && (
            <div style={note}>{tt('mcp.unreal_panel.download', 'Setting up downloads Node (36 MB) once from nodejs.org, checked before it is used.')}</div>
          )}
        </div>
        {p.canInstall && (!p.installed || !p.current) && (
          <button style={primary} disabled={busy} onClick={() => void setUp()}>
            {busy ? tt('mcp.unreal_panel.setting_up', 'Setting up…') : p.installed ? tt('mcp.unreal_panel.update', 'Update') : tt('mcp.unreal_panel.set_up', 'Set up')}
          </button>
        )}
        {p.installed && <button style={link} onClick={() => setOpen(!open)}>{open ? tt('mcp.unreal_panel.hide_steps', 'Hide the steps') : tt('mcp.unreal_panel.show_steps', 'Show the steps')}</button>}
      </div>
      {problem && <div style={{ ...note, color: C.danger }}>{problem}</div>}
      {open && p.installed && (
        <div style={{ marginTop: 6 }}>
          <div style={step}>{tt('mcp.unreal_panel.step1', '1. In Unreal: Edit → Editor Preferences → Unreal Assistant → External Agent.')}</div>
          <div style={step}>{tt('mcp.unreal_panel.step2', '2. Tick Use External Agent, and set External Agent to Custom.')}</div>
          <div style={step}>{tt('mcp.unreal_panel.step3', '3. Custom Agent Command:')}</div>
          <CopyLine text={p.command} />
          <div style={step}>{tt('mcp.unreal_panel.step4', '4. Custom Agent Arguments: add one item, and paste:')}</div>
          {p.args.map((a) => <CopyLine key={a} text={a} />)}
          <div style={step}>{tt('mcp.unreal_panel.step5', '5. Open the Assistant panel (the Assistant button at the bottom of the editor, or Window → Unreal Assistant), start a New Chat, and allow Ava when Unreal asks.')}</div>
          <div style={note}>{tt('mcp.unreal_panel.menus_note', "If the mode and model menus don't show in your first chat, start another New Chat — Unreal shows them from then on.")}</div>
          <div style={step}>{tt('mcp.unreal_panel.step6', '6. Once per project: turn on All Toolsets (Edit → Plugins), then restart Unreal — or most of my Unreal tools stay hidden.')}</div>
          <div style={{ ...opinion, marginTop: 12 }}>{tt('mcp.unreal_panel.kimodo', "Optional — animation with Kimodo: it needs a Hugging Face account and Meta's approval for Llama 3. Ask for it early, as approval can take a while. Ask me and I'll walk you through it.")}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The Unreal tools he allowed once in Unreal's Assistant panel, newest first.
 * The panel's prompt has only Deny / Allow Once (Phase 0), so "Always allow"
 * for one of them is given here, by him — never by Ava (his call, 18 Nov).
 */
function UnrealAsked({ asked, busy, onAlways }: { asked: string[]; busy: boolean; onAlways: (inner: string) => void }) {
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      <div style={{ fontSize: 13.5, color: C.text, fontWeight: 500 }}>{tt('mcp.unreal_panel.asked', 'Asked recently in Unreal')}</div>
      <div style={note}>{tt('mcp.unreal_panel.asked_hint', "Tools you allowed once in Unreal's panel. \"Always allow\" stops one asking.")}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 13, marginTop: 6, alignItems: 'center' }}>
        {asked.map((inner) => (
          <Fragment key={inner}>
            <span style={{ fontFamily: mono, fontSize: 12.5, color: C.text, minWidth: 0, overflowWrap: 'anywhere' }}>{inner}</span>
            <button style={yesBtn} disabled={busy} onClick={() => onAlways(inner)}>{tt('mcp.unreal_panel.always_allow', 'Always allow')}</button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * Unreal Engine (core mcp/unreal.ts): its ~1,900 tools sit behind one, so there's
 * no per-tool list here — what only looks runs, the rest asks, and the Unreal
 * tools he said "always" for are listed to take back.
 */
function UnrealTools({ s, busy, onAskAgain }: { s: Server; busy: boolean; onAskAgain: (inner: string) => void }) {
  const allowed = s.unreal?.allowed ?? [];
  // Collapsed by default: the list grows with every "Always allow" (his ask, 19 Nov).
  const [showAllowed, setShowAllowed] = useState(false);
  return (
    <>
      <div style={note}>{s.unreal?.labelled === false
        // 5.8: Unreal doesn't label its tools, so nothing runs without asking.
        ? tt('mcp.page.unreal.hint_unlabelled', "This Unreal doesn't mark which tools only look, so each one asks the first time, until you choose Always.")
        : tt('mcp.page.unreal.hint', 'When I only look, I go straight ahead; before I change your project or run anything, I ask you.')}</div>
      {allowed.length > 0 && (
        <>
          <button style={{ ...link, ...note, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }} aria-expanded={showAllowed} onClick={() => setShowAllowed(!showAllowed)}>
            <span style={{ display: 'inline-block', width: 10 }}>{showAllowed ? '▾' : '▸'}</span>
            {tt('mcp.page.unreal.always', 'Always allowed in Unreal')} ({allowed.length})
          </button>
          {showAllowed && <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 13, marginTop: 6, alignItems: 'center' }}>
            {allowed.map((inner) => (
              <Fragment key={inner}>
                <span style={{ fontFamily: mono, fontSize: 12.5, color: C.text, minWidth: 0, overflowWrap: 'anywhere' }}>{inner}</span>
                <button style={btn} disabled={busy} onClick={() => onAskAgain(inner)}>{tt('mcp.page.ask_again', 'Ask me again')}</button>
              </Fragment>
            ))}
          </div>}
        </>
      )}
    </>
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

function AddPanel({ request, onClose, onState, onAskAva, onImport }: {
  request: ConnectionsRequest; onClose: () => void; onState: (s: PageState) => void;
  onAskAva?: (what: string) => void; onImport: () => void;
}) {
  const [how, setHow] = useState<'ava' | 'me'>(onAskAva ? 'ava' : 'me');
  const [what, setWhat] = useState('');
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
  const choice = (on: boolean): CSSProperties => ({ border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.soft : 'transparent', borderRadius: 10, padding: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: C.text, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' });
  const ask = () => { if (what.trim() && onAskAva) { onAskAva(what.trim()); onClose(); } };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 50, zIndex: 50 }}>
      <div role="dialog" aria-label={tt('mcp.page.add.title', 'Add a server')}
        style={{ width: 'min(640px, 92vw)', background: '#1a1028', border: `1px solid ${C.strong}`, borderRadius: 14, padding: '18px 20px', maxHeight: '84vh', overflow: 'auto', color: C.text }}>
        <div style={{ fontWeight: 500, fontSize: 17 }}>{tt('mcp.page.add.title', 'Add a server')}</div>
        <div style={{ ...note, marginTop: 2 }}>{tt('mcp.page.add.intro', 'A server is a program or a website that gives me more tools. It runs as you, so you see exactly what runs first.')}</div>

        {onAskAva && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0 4px' }}>
            <button style={choice(how === 'ava')} onClick={() => setHow('ava')}>
              <b style={{ fontWeight: 500, display: 'block', marginBottom: 2 }}>{tt('mcp.page.add.choice_ava', 'Ask Ava')}</b>
              <span style={{ color: C.muted, fontSize: 12.5 }}>{tt('mcp.page.add.choice_ava_d', 'Tell me what you want to connect. I find the official server, look into it and tell you what I think, then set it up on your yes.')}</span>
            </button>
            <button style={choice(how === 'me')} onClick={() => setHow('me')}>
              <b style={{ fontWeight: 500, display: 'block', marginBottom: 2 }}>{tt('mcp.page.add.choice_me', 'Add it myself')}</b>
              <span style={{ color: C.muted, fontSize: 12.5 }}>{tt('mcp.page.add.choice_me_d', 'Paste a command or an address, or bring in servers from Claude Desktop, Cursor or VS Code.')}</span>
            </button>
          </div>
        )}

        {how === 'ava' && onAskAva ? (
          <>
            <label style={label}>{tt('mcp.page.add.ava_what', 'What would you like to connect?')}</label>
            <input style={input} autoFocus value={what} onChange={(e) => setWhat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
              placeholder={tt('mcp.page.add.ava_placeholder', 'e.g. my Notion workspace, Linear, a local SQLite file')} />
            <div style={note}>{tt('mcp.page.add.ava_note', 'I look for the official server first and check its publisher in the official MCP Registry. I tell you what it can reach and my honest view, then wait for your yes.')}</div>
            <div style={acts}>
              <button style={primary} disabled={!what.trim()} onClick={ask}>{tt('mcp.page.add.ava_go', 'Ask Ava')}</button>
              <button style={btn} onClick={onClose}>{tt('mcp.page.cancel', 'Cancel')}</button>
            </div>
          </>
        ) : (<>

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
          <button style={btn} onClick={() => { onClose(); onImport(); }}>{tt('mcp.page.add.import', 'Bring in from Claude Desktop, Cursor or VS Code')}</button>
          <button style={btn} onClick={onClose}>{tt('mcp.page.cancel', 'Cancel')}</button>
        </div>
        </>)}
      </div>
    </div>
  );
}

// ── Suggested servers (core mcp/suggested.ts) ─────────────────────────────

function SuggestedRow({ g, request, onState }: { g: Suggestion; request: ConnectionsRequest; onState: (s: PageState) => void }) {
  const [check, setCheck] = useState<{ shows: string; notes: Note[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const view = tt(`mcp.suggest.${g.id}.view`, g.view);
  const kind = g.kind === 'open' ? tt('mcp.page.kind_open', 'Free · no account')
    : g.kind === 'local' ? tt('mcp.page.kind_local', 'On this computer · free')
    : g.kind === 'signin' ? tt('mcp.page.kind_signin', 'Free account · sign in') : tt('mcp.page.kind_key', 'Free account · key');
  const green = g.kind === 'open' || g.kind === 'local';
  const open = async () => {
    setBusy(true); setProblem('');
    try {
      const r = await request('check_suggested', { id: g.id }) as { ok: boolean; shows?: string; notes?: Note[]; problem?: string };
      if (r.ok) setCheck({ shows: r.shows ?? '', notes: r.notes ?? [] }); else setProblem(r.problem ?? '');
    } finally { setBusy(false); }
  };
  const add = async () => {
    setBusy(true);
    try {
      const r = await request('add_suggested', { id: g.id, view: view || undefined }) as { ok: boolean; state?: PageState; problem?: string };
      if (r.ok && r.state) onState(r.state); else setProblem(r.problem ?? '');
    } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, padding: '12px 16px', margin: '8px 0' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: C.text }}>
            {g.name}
            <span style={chip(green ? C.ok : C.online, green ? 'rgba(52,211,153,0.3)' : 'rgba(96,165,250,0.35)')}>{kind}</span>
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 400 }}>
              {g.publisher}{g.registry ? ` · ✓ ${tt('mcp.page.verified', 'verified in the MCP Registry')}` : ''}
            </span>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 3, color: C.text2 }}>{tt(`mcp.suggest.${g.id}.what`, g.what)}</div>
        </div>
        <button style={btn} title={g.docs} onClick={() => void request('open_docs', { url: g.docs })}>{tt('mcp.page.docs', 'Docs')}</button>
        {!check && <button style={btn} disabled={busy} onClick={() => void open()}>{tt('mcp.page.add_short', 'Add')}</button>}
      </div>
      {check && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          {view && <div style={{ ...opinion, marginTop: 0 }}><b style={{ color: C.text, fontWeight: 500 }}>{tt('mcp.page.my_view', 'My view:')}</b> {view}</div>}
          <div style={note}>{tt('mcp.page.address', 'Address')}</div>
          <div style={cmd}>{check.shows}</div>
          <Notes notes={check.notes} />
          {g.kind === 'signin' && <div style={note}>{tt('mcp.page.after_signin', "Once it's added, press Sign in on its card.")}</div>}
          {g.kind === 'key' && <div style={note}>{tt('mcp.page.after_key', "Once it's added, set its key under Tools & details.")}</div>}
          <div style={acts}>
            <button style={primary} disabled={busy} onClick={() => void add()}>{tt('mcp.page.add.add', 'Add it')}</button>
            <button style={btn} onClick={() => setCheck(null)}>{tt('mcp.page.cancel', 'Cancel')}</button>
          </div>
        </div>
      )}
      {problem && <div style={{ ...note, color: C.danger }}>{problem}</div>}
    </div>
  );
}

// ── Bringing servers in from his other apps ──────────────────────────────

type ImportApp = 'claude-desktop' | 'cursor' | 'vscode';
interface ImportServer { name: string; id: string; shows: string; notes: Note[]; online: boolean; here: 'no' | 'same' | 'different'; keysMoved: number; slots: string[] }
interface ImportSource { app: ImportApp; appName: string; found: boolean; problem?: string; servers: ImportServer[] }

function ImportPanel({ request, onClose, onState }: { request: ConnectionsRequest; onClose: () => void; onState: (s: PageState) => void }) {
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [failed, setFailed] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: string[]; skipped: string[] } | null>(null);
  useEffect(() => {
    request('import_scan')
      .then((r) => setSources((r as { sources: ImportSource[] }).sources))
      .catch((e) => setFailed(e instanceof Error ? e.message : String(e)));
  }, [request]);
  const k = (app: ImportApp, name: string) => `${app}\n${name}`;
  const toggle = (key: string) => setPicked((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const bringIn = async () => {
    setBusy(true);
    try {
      const picks = [...picked].map((x) => { const [app, name] = x.split('\n'); return { app, name }; });
      const r = await request('import', { picks }) as { result: { added: Array<{ id: string }>; skipped: Array<{ name: string }> }; state: PageState };
      onState(r.state);
      setDone({ added: r.result.added.map((a) => a.id), skipped: r.result.skipped.map((s) => s.name) });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const appLine = (s: ImportSource) => !s.found ? tt('mcp.page.import.not_found', "{app} isn't set up on this computer.").replace('{app}', s.appName)
    : s.problem ? tt('mcp.page.import.problem', "{app}'s file couldn't be read: {error}").replace('{app}', s.appName).replace('{error}', s.problem)
    : tt('mcp.page.import.none', '{app} has no servers.').replace('{app}', s.appName);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 50, zIndex: 50 }}>
      <div role="dialog" aria-label={tt('mcp.page.import.title', 'Bring in servers')}
        style={{ width: 'min(680px, 92vw)', background: '#1a1028', border: `1px solid ${C.strong}`, borderRadius: 14, padding: '18px 20px', maxHeight: '84vh', overflow: 'auto', color: C.text }}>
        <div style={{ fontWeight: 500, fontSize: 17 }}>{tt('mcp.page.import.title', 'Bring in servers')}</div>
        <div style={{ ...note, marginTop: 2 }}>{tt('mcp.page.import.intro', 'Servers you set up in your other apps. Their files are only read; keys written in them move into your keychain.')}</div>
        {failed && <div style={{ ...note, color: C.danger }}>{failed}</div>}
        {!sources && !failed && <div style={note}>{tt('mcp.page.import.reading', 'Looking in your other apps…')}</div>}
        {done ? (
          <div style={{ marginTop: 14, fontSize: 13, color: C.text2 }}>
            {done.added.length > 0 && <div>{tt('mcp.page.import.done', 'Brought in: {names}').replace('{names}', done.added.join(', '))}</div>}
            {done.skipped.length > 0 && <div style={{ color: C.warn }}>{tt('mcp.page.import.skipped', 'Not brought in: {names}').replace('{names}', done.skipped.join(', '))}</div>}
            <div style={note}>{tt('mcp.page.import.after', 'Each one starts now, and its tools ask you the first time.')}</div>
            <div style={acts}><button style={primary} onClick={onClose}>{tt('mcp.page.done', 'Done')}</button></div>
          </div>
        ) : sources && (
          <>
            {sources.map((src) => (
              <div key={src.app} style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{src.appName}</div>
                {(!src.found || src.problem || !src.servers.length) && <div style={note}>{appLine(src)}</div>}
                {src.servers.map((s) => {
                  const key = k(src.app, s.name);
                  const same = s.here === 'same';
                  return (
                    <label key={key} style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: same ? 'default' : 'pointer', opacity: same ? 0.6 : 1, margin: '8px 0' }}>
                      <input type="checkbox" disabled={same} checked={picked.has(key)} onChange={() => toggle(key)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontWeight: 500 }}>
                          {s.name}
                          {!onThisComputer(s)
                            ? <span style={chip(C.online, 'rgba(96,165,250,0.35)')}>{tt('mcp.page.online', 'Online')}</span>
                            : <span style={chip(C.ok, 'rgba(52,211,153,0.3)')}>{tt('mcp.page.local', 'On this computer')}</span>}
                        </div>
                        <div style={cmd}>{s.shows}</div>
                        <Notes notes={s.notes} />
                        {same && <div style={note}>{tt('mcp.page.import.here_same', 'Already in your list')}</div>}
                        {s.here === 'different' && <div style={{ ...note, color: C.warn }}>{tt('mcp.page.import.here_diff', 'You have a different "{id}": this one comes in as "{new}"').replace('{id}', s.id).replace('{new}', `${s.id}-${src.app}`)}</div>}
                        {s.keysMoved > 0 && <div style={note}>🔑 {(s.keysMoved === 1 ? tt('mcp.page.import.keys_moved_one', '1 key moves into your keychain') : tt('mcp.page.import.keys_moved', '{n} keys move into your keychain')).replace('{n}', String(s.keysMoved))}</div>}
                        {s.slots.length > 0 && <div style={note}>🔑 {tt('mcp.page.import.slots', 'Keys to set afterwards: {names}').replace('{names}', s.slots.join(', '))}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
            <div style={acts}>
              <button style={primary} disabled={busy || picked.size === 0} onClick={() => void bringIn()}>{tt('mcp.page.import.go', 'Bring in ({n})').replace('{n}', String(picked.size))}</button>
              <button style={btn} onClick={onClose}>{tt('mcp.page.cancel', 'Cancel')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────────

export function ConnectionsPage({ request, onWaitingChange, onAskAva }: {
  request: ConnectionsRequest; onWaitingChange?: (n: number) => void;
  /** Opens the main chat with his request written in ("Ask Ava" in the Add panel). */
  onAskAva?: (message: string) => void;
}) {
  const [st, setSt] = useState<PageState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
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

        {(st.suggested ?? []).some((g) => !g.added) && (
          <>
            <div style={h2}>
              <span>{tt('mcp.page.suggested', 'Suggested')}</span>
              <span style={hint}>{tt('mcp.page.suggested_hint', 'Free, from the companies themselves · checked by me')}</span>
            </div>
            {(st.suggested ?? []).filter((g) => !g.added).map((g) => <SuggestedRow key={g.id} g={g} request={request} onState={show} />)}
          </>
        )}

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
    <div style={{ padding: '26px 32px 80px', color: C.text }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 2px' }}>{tt('dash.nav.connections', 'Connections')}</h1>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 18 }}>{tt('mcp.page.subtitle', 'MCP servers give me more tools: your GitHub, your files, your other apps. Nothing here runs until you say yes.')}</div>
      {body}
      {adding && <AddPanel request={request} onClose={() => setAdding(false)} onState={show} onImport={() => setImporting(true)}
        onAskAva={onAskAva ? (what) => onAskAva(tt('mcp.page.add.ava_message', 'Help me connect {what} as an MCP server.').replace('{what}', what)) : undefined} />}
      {importing && <ImportPanel request={request} onClose={() => setImporting(false)} onState={show} />}
    </div>
  );
}
