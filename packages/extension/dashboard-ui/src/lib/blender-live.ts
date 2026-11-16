// Blender Live in the extension's dashboard: the Blender room's Headless · Live
// switch, its status line, and the sidebar label that follows it ("Blender
// (Headless)" / "Blender (Live)"). One setting for the room, shared with the
// IDE through ~/.ava/config.json. Mirrors the IDE's lib/blender-live.ts.
import { useEffect, useState } from 'react';
import { post } from '../App';
import { tt } from '../i18n';

export type BlenderLiveState = 'needs-uv' | 'needs-server' | 'off' | 'blender-closed' | 'ready' | 'error';

export interface BlenderLive {
  /** The switch: Live chosen for the room. */
  wanted: boolean;
  state: BlenderLiveState;
  /** The host's own words (English) — shown only for an unexpected error. */
  message: string;
  blenderVersion: string | null;
  busy: boolean;
}

const initial: BlenderLive = { wanted: false, state: 'off', message: '', blenderVersion: null, busy: false };
let last = initial;
const listeners = new Set<(s: BlenderLive) => void>();
let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { type?: string } & Partial<BlenderLive>;
    if (m?.type !== 'blender_live_status') return;
    last = {
      wanted: m.wanted === true,
      state: (m.state ?? 'off') as BlenderLiveState,
      message: String(m.message ?? ''),
      blenderVersion: m.blenderVersion ?? null,
      busy: m.busy === true,
    };
    for (const l of listeners) l(last);
  });
}

export function useBlenderLive(): BlenderLive {
  const [s, setS] = useState(last);
  useEffect(() => {
    listen();
    listeners.add(setS);
    post({ type: 'get_blender_live' });
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

export function setBlenderLive(on: boolean): void {
  post({ type: 'set_blender_live', on });
}

/** The room's name, following the switch. */
export function blenderRoomName(wanted: boolean): string {
  return wanted ? tt('dash.studio.asset.model_mcp', 'Blender (MCP)') : tt('dash.studio.asset.model', 'Blender (Headless)');
}

/** The status line, in their language. */
export function blenderLiveLine(s: BlenderLive): string {
  if (s.busy) return tt('dash.studio.live.connecting', 'Connecting to Blender…');
  switch (s.state) {
    case 'ready': return tt('dash.studio.live.ready', 'Connected to Blender {version} · ready').replace('{version}', s.blenderVersion ?? '');
    case 'blender-closed': return tt('dash.studio.live.closed', 'Blender isn’t open with the MCP add-on running. Open Blender 5.1 or newer.');
    case 'needs-uv':
    case 'needs-server': return tt('dash.studio.live.setup', 'Live needs a one-time setup. Ask Ava to set it up for you.');
    case 'error': return s.message || tt('dash.studio.live.error', 'Live couldn’t connect to Blender.');
    default: return tt('dash.studio.live.off', 'Ava builds headless, with no Blender window.');
  }
}
