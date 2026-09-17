import { useState } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { t } from '../../i18n';

/**
 * Tools that are LOOKUPS — a read against a catalogue, nothing changed — and
 * which a room fires several times in a row while it thinks. Each one as a
 * full ToolCallBlock is four rows of chrome for "I searched"; a plan that
 * took six searches pushed the actual plan off the screen. So consecutive
 * lookups collapse into one slim strip with a count, and open on click to
 * show what each one asked for and how many it found.
 */
export const LOOKUP_TOOLS = new Set(['health_catalogue_search']);

function describe(tc: ToolCallDisplay): { asked: string; found: string } {
  let asked = '';
  try {
    const a = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
    asked = ['query', 'category', 'muscle', 'pattern', 'equipment', 'difficulty']
      .filter((k) => a[k] != null && a[k] !== '')
      .map((k) => (k === 'query' ? `“${String(a[k])}”` : `${k}: ${Array.isArray(a[k]) ? (a[k] as unknown[]).join(', ') : String(a[k])}`))
      .join(' · ');
  } catch { /* not JSON — leave it blank */ }
  const m = /^Found (\d+) (exercise|recipe)s?/.exec(tc.result || '');
  const found = tc.status === 'failed' ? t('tool.lookup.failed') : m ? t('tool.lookup.found', { n: m[1] }) : '';
  return { asked, found };
}

export function LookupStrip({ toolCalls }: { toolCalls: ToolCallDisplay[] }) {
  const [open, setOpen] = useState(false);
  const running = toolCalls.some((tc) => tc.status === 'running' || tc.status === 'pending_confirmation');
  const failed = toolCalls.some((tc) => tc.status === 'failed');
  const n = toolCalls.length;

  return (
    <div className="w-full my-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-md text-[11px] border-none cursor-pointer
                   bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]
                   text-[var(--vscode-foreground)] transition-colors max-w-full"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={running ? 'animate-pulse' : failed ? 'text-red-400' : 'opacity-60'}>
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <span className="opacity-80">{t('tool.lookup.catalogue')}</span>
        {n > 1 && <span className="opacity-50">× {n}</span>}
        <span className="text-[9px] opacity-40">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="list-none m-0 mt-0.5 pl-6 space-y-0.5">
          {toolCalls.map((tc) => {
            const { asked, found } = describe(tc);
            return (
              <li key={tc.id} className="text-[11px] opacity-70 truncate">
                <span className={tc.status === 'failed' ? 'text-red-400' : ''}>{asked || tc.name}</span>
                {found && <span className="opacity-60"> — {found}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
