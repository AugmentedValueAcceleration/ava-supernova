// Inline documentation page for the dashboard. Renders the canonical corpus from @ava/core/docs
// using Tailwind primitives that match the dashboard's existing look-and-feel. Sidebar-collapsible.

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  type RendererAdapter,
  type DocBlock,
  type FactsData,
  TOOLS,
  CATEGORY_LABELS,
  PROVIDERS,
  MODES,
  PERSONAS,
  PERMISSION_MODES,
  PERMISSION_LABELS,
  SHORTCUTS,
  filterBySurface,
  buildSidebar,
  anchorFor,
  getPages,
} from '@ava/core/docs';

function makeAdapter(): RendererAdapter<ReactNode> {
  let seed = 0;
  const k = () => `k${++seed}`;

  return {
    paragraph: (text) => <p key={k()} className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">{text}</p>,

    heading: (level, text, anchor) => {
      const Tag = `h${level}` as const;
      const styles: Record<number, string> = {
        2: 'text-lg font-medium text-white mt-6 mb-3',
        3: 'text-sm font-semibold text-white mt-4 mb-2',
        4: 'text-xs uppercase tracking-wider text-[var(--accent)] mt-3 mb-2',
      };
      return <Tag key={k()} id={anchor} className={`${styles[level]} scroll-mt-4`}>{text}</Tag>;
    },

    list: (items, ordered) => {
      const Tag = ordered ? 'ol' : 'ul';
      return (
        <Tag key={k()} className={`text-[13px] text-[var(--text-secondary)] leading-relaxed ${ordered ? 'list-decimal' : 'list-disc'} pl-5 mb-3 space-y-1`}>
          {items.map((i, idx) => <li key={idx}>{i}</li>)}
        </Tag>
      );
    },

    code: (text) => (
      <pre key={k()} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] p-3 text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto mb-3">
        <code>{text}</code>
      </pre>
    ),

    callout: (text, variant) => {
      const cls = variant === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : variant === 'tip' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--accent)]/30 bg-[var(--accent)]/5';
      const labelColour = variant === 'warning' ? 'text-amber-400' : variant === 'tip' ? 'text-emerald-400' : 'text-[var(--accent)]';
      const label = variant === 'tip' ? 'Tip' : variant === 'warning' ? 'Warning' : 'Note';
      return (
        <div key={k()} className={`rounded-md border ${cls} p-3 my-3 text-[12px] text-[var(--text-secondary)]`}>
          <span className={`font-medium ${labelColour}`}>{label}:</span> {text}
        </div>
      );
    },

    link: (text, href, external) => (
      <a key={k()} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="text-[var(--accent)] hover:underline">
        {text}
      </a>
    ),

    table: (headers, rows) => (
      <div key={k()} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] overflow-x-auto mb-4">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {headers.map((h, i) => (
                <th key={i} className="text-left p-2 font-light border-b border-[var(--border-input)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-[var(--border-input)] align-top">
                {r.map((cell, ci) => (
                  <td key={ci} className={`p-2 ${ci === 0 ? 'text-[var(--accent)] font-medium whitespace-nowrap' : 'text-[var(--text-secondary)]'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),

    tools: (items) => {
      const grouped = groupBy(items, t => t.category);
      return (
        <div key={k()} className="space-y-4 mb-3">
          {Array.from(grouped.entries()).map(([cat, tools]) => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--accent)] mb-1">{CATEGORY_LABELS[cat]}</div>
              <div className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="text-left p-2">Tool</th><th className="text-left p-2">Risk</th><th className="text-left p-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                      <tr key={t.name} className="border-t border-[var(--border-input)]">
                        <td className="p-2"><code className="text-[11px] bg-black/40 px-1.5 py-0.5 rounded text-white">{t.name}</code></td>
                        <td className="p-2"><RiskBadge risk={t.risk} /></td>
                        <td className="p-2 text-[var(--text-secondary)]">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      );
    },

    providers: (items) => (
      <div key={k()} className="space-y-4 mb-3">
        {items.map(p => (
          <div key={p.id}>
            <div className="flex items-baseline justify-between mb-1">
              <h4 className="text-sm font-medium text-white">{p.name}</h4>
              {p.notes && <span className="text-[10px] text-[var(--text-muted)]">{p.notes}</span>}
            </div>
            <div className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="text-left p-2">Model</th><th className="text-left p-2">Context</th><th className="text-left p-2">$/1M in/out</th><th className="text-left p-2">Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {p.models.map(m => {
                    const price = m.inputPricePerM === 0 && m.outputPricePerM === 0 ? 'Free' : `$${m.inputPricePerM.toFixed(2)} / $${m.outputPricePerM.toFixed(2)}`;
                    return (
                      <tr key={m.id} className="border-t border-[var(--border-input)]">
                        <td className="p-2 text-white">{m.displayName}</td>
                        <td className="p-2 text-[var(--text-secondary)]">{formatContext(m.contextWindow)}</td>
                        <td className="p-2 text-[var(--text-secondary)]">{price}</td>
                        <td className="p-2 flex flex-wrap gap-1">{m.capabilities.map((c, i) => <Pill key={i}>{c}</Pill>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    ),

    modes: (items) => (
      <div key={k()} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] overflow-hidden mb-3">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="text-left p-2">Prefix</th><th className="text-left p-2">Mode</th><th className="text-left p-2">Mindset</th><th className="text-left p-2">Summary</th>
            </tr>
          </thead>
          <tbody>
            {items.map(m => (
              <tr key={m.id} className="border-t border-[var(--border-input)]">
                <td className="p-2"><code className="text-[11px] text-[var(--accent)] font-mono">{m.prefix}</code></td>
                <td className="p-2 text-white">{m.displayName}</td>
                <td className="p-2 text-[var(--text-secondary)]">{m.mindset}</td>
                <td className="p-2 text-[var(--text-secondary)]">{m.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),

    personas: (items) => {
      const grouped = groupBy(items, p => p.mode);
      return (
        <div key={k()} className="space-y-4 mb-3">
          {Array.from(grouped.entries()).map(([mode, personas]) => (
            <div key={mode}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--accent)] mb-1 capitalize">{mode} team</div>
              <ol className="list-decimal pl-5 space-y-0.5 text-[12px] text-[var(--text-secondary)]">
                {personas.sort((a, b) => a.order - b.order).map(p => (
                  <li key={p.id}><span className="text-white">{p.name}</span> — {p.role}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      );
    },

    permissions: (items) => {
      const categories = Object.keys(items[0].categories) as Array<keyof typeof items[0]['categories']>;
      return (
        <div key={k()} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] overflow-hidden mb-3">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="text-left p-2">Category</th>
                {items.map(m => <th key={m.id} className="text-left p-2">{m.displayName}</th>)}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={String(cat)} className="border-t border-[var(--border-input)]">
                  <td className="p-2 text-white">{(CATEGORY_LABELS as Record<string, string>)[cat] ?? String(cat)}</td>
                  {items.map(m => <td key={m.id} className="p-2"><PermBadge perm={m.categories[cat]} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },

    shortcuts: (items) => (
      <div key={k()} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-card)] overflow-hidden mb-3">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="text-left p-2">Action</th><th className="text-left p-2">Win / Mac</th><th className="text-left p-2">Surface</th><th className="text-left p-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s, i) => (
              <tr key={i} className="border-t border-[var(--border-input)]">
                <td className="p-2 text-white">{s.action}</td>
                <td className="p-2"><Kbd>{s.keysWin}</Kbd><span className="text-[var(--text-muted)]"> / </span><Kbd>{s.keysMac}</Kbd></td>
                <td className="p-2 flex flex-wrap gap-1">{s.surfaces.map((x, j) => <Pill key={j}>{x}</Pill>)}</td>
                <td className="p-2 text-[var(--text-secondary)]">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),

    page: (title, blocks, anchor) => (
      <section key={anchor} id={anchor} className="mb-8 scroll-mt-4">
        <h2 className="text-xl font-medium text-white mb-4 pb-2 border-b border-[var(--border-input)]">{title}</h2>
        {blocks}
      </section>
    ),

    document: () => null,
  };
}

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) { const kk = key(x); if (!m.has(kk)) m.set(kk, []); m.get(kk)!.push(x); }
  return m;
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function RiskBadge({ risk }: { risk: 'safe' | 'write' | 'dangerous' }) {
  const cls = risk === 'safe' ? 'bg-emerald-500/15 text-emerald-400' : risk === 'write' ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide ${cls}`}>{risk}</span>;
}

function PermBadge({ perm }: { perm: 'auto' | 'first_time' | 'always_ask' }) {
  const cls = perm === 'auto' ? 'bg-emerald-500/15 text-emerald-400' : perm === 'first_time' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] ${cls}`}>{PERMISSION_LABELS[perm]}</span>;
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-[var(--text-muted)]">{children}</span>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-1 py-0.5 rounded text-[10px] font-mono border border-[var(--border-input)] bg-black/40 text-white">{children}</kbd>;
}

function renderBlock(block: DocBlock, adapter: RendererAdapter<ReactNode>, data: FactsData): ReactNode {
  switch (block.type) {
    case 'paragraph': return adapter.paragraph(block.text);
    case 'heading':   return adapter.heading(block.level, block.text, block.anchor);
    case 'list':      return adapter.list(block.items, block.ordered);
    case 'code':      return adapter.code(block.text, block.language);
    case 'callout':   return adapter.callout(block.text, block.variant);
    case 'link':      return adapter.link(block.text, block.href, block.external ?? false);
    case 'table':     return adapter.table(block.headers, block.rows);
    case 'facts': {
      switch (block.kind) {
        case 'tools': {
          const f = block.filter;
          const filtered = data.tools.filter(t => (!f?.category || t.category === f.category) && (!f?.risk || t.risk === f.risk));
          return adapter.tools(filtered, block);
        }
        case 'providers': {
          const f = block.filter;
          const filtered = f?.kind ? data.providers.filter(p => p.kind === f.kind) : data.providers;
          return adapter.providers(filtered, block);
        }
        case 'modes': return adapter.modes(data.modes);
        case 'personas': {
          const f = block.filter;
          const filtered = f?.mode ? data.personas.filter(p => p.mode === f.mode) : data.personas;
          return adapter.personas(filtered, block);
        }
        case 'permissions': return adapter.permissions(data.permissions);
        case 'shortcuts': {
          const f = block.filter;
          const filtered = f?.surface ? data.shortcuts.filter(s => s.surfaces.includes(f.surface!)) : data.shortcuts;
          return adapter.shortcuts(filtered, block);
        }
      }
    }
  }
}

export function DocumentationPage() {
  const { pages, sidebar } = useMemo(() => {
    // Static — no audience filtering, no search. Show every page available
    // on this surface, every time. Operator wanted no interactive controls
    // in the sidebar; keep it as a fixed nav.
    const all = filterBySurface(getPages(), 'ext');
    return { pages: all, sidebar: buildSidebar(all) };
  }, []);

  const data: FactsData = {
    tools: TOOLS, providers: PROVIDERS, modes: MODES, personas: PERSONAS,
    permissions: PERMISSION_MODES, shortcuts: SHORTCUTS,
  };

  const adapter = makeAdapter();

  return (
    <div className="flex gap-4 h-full min-h-0">
      <aside className="w-56 shrink-0 border-r border-[var(--border-input)] pr-3 overflow-y-auto h-full">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2 sticky top-0 bg-[var(--bg-page)] py-1">Docs</div>
        <nav className="space-y-3 pb-4">
          {sidebar.map(section => (
            <div key={section.id}>
              <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1 px-1">{section.title}</div>
              {section.pages.map(p => (
                <a
                  key={p.id}
                  href={`#${p.anchor}`}
                  className="block px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-white hover:bg-[var(--accent)]/10 rounded"
                >
                  {p.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto pr-1">
        {pages.map(page => {
          const blocks = page.body.map(b => renderBlock(b, adapter, data));
          return adapter.page(page.title, blocks, anchorFor(page.id));
        })}
      </main>
    </div>
  );
}
