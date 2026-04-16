// HTML-string adapter for the VS Code DocsPanel webview.
// Pure function pipeline: corpus → filtered pages → HTML string. No runtime dependencies,
// no React, safe for a nonce-restricted webview context.

import {
  type RendererAdapter,
  type DocPage,
  type SidebarNode,
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
  filterByAudience,
  buildSidebar,
  anchorFor,
  getPages,
} from '@ava/core/docs';

// ── Escaping ────────────────────────────────────────────────────────────────

const AMP = /&/g, LT = /</g, GT = />/g, QUOT = /"/g, APOS = /'/g;
function esc(s: string): string {
  return s.replace(AMP, '&amp;').replace(LT, '&lt;').replace(GT, '&gt;').replace(QUOT, '&quot;').replace(APOS, '&#39;');
}

// ── Adapter ─────────────────────────────────────────────────────────────────

const htmlAdapter: RendererAdapter<string> = {
  paragraph: (text) => `<p>${esc(text)}</p>`,

  heading: (level, text, anchor) => {
    const id = anchor ? ` id="${esc(anchor)}"` : '';
    return `<h${level}${id}>${esc(text)}</h${level}>`;
  },

  list: (items, ordered) => {
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag}>${items.map(i => `<li>${esc(i)}</li>`).join('')}</${tag}>`;
  },

  code: (text, language) => `<pre class="code" data-lang="${esc(language)}"><code>${esc(text)}</code></pre>`,

  callout: (text, variant) => `<div class="callout callout-${variant}"><strong>${variantLabel(variant)}:</strong> ${esc(text)}</div>`,

  link: (text, href, external) => {
    const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
    return `<a href="${esc(href)}"${rel}>${esc(text)}</a>`;
  },

  tools: (items) => {
    const grouped = groupBy(items, t => t.category);
    const blocks: string[] = [];
    for (const [category, tools] of grouped) {
      blocks.push(`<h4>${esc(CATEGORY_LABELS[category])}</h4>`);
      blocks.push('<table class="facts"><thead><tr><th>Tool</th><th>Risk</th><th>What it does</th></tr></thead><tbody>');
      for (const t of tools.sort((a, b) => a.name.localeCompare(b.name))) {
        blocks.push(`<tr><td><code>${esc(t.name)}</code></td><td><span class="risk risk-${t.risk}">${esc(t.risk)}</span></td><td>${esc(t.description)}</td></tr>`);
      }
      blocks.push('</tbody></table>');
    }
    return `<div class="facts-block">${blocks.join('')}</div>`;
  },

  providers: (items) => {
    const blocks: string[] = [];
    for (const p of items) {
      blocks.push(`<h4>${esc(p.name)}${p.notes ? ` <span class="muted small">— ${esc(p.notes)}</span>` : ''}</h4>`);
      blocks.push('<table class="facts"><thead><tr><th>Model</th><th>Context</th><th>Input / Output (per 1M tokens)</th><th>Capabilities</th></tr></thead><tbody>');
      for (const m of p.models) {
        const price = m.inputPricePerM === 0 && m.outputPricePerM === 0
          ? 'Free'
          : `$${m.inputPricePerM.toFixed(2)} / $${m.outputPricePerM.toFixed(2)}`;
        blocks.push(`<tr><td>${esc(m.displayName)}</td><td>${formatContext(m.contextWindow)}</td><td>${price}</td><td>${m.capabilities.map(c => `<span class="cap">${esc(c)}</span>`).join(' ')}</td></tr>`);
      }
      blocks.push('</tbody></table>');
    }
    return `<div class="facts-block">${blocks.join('')}</div>`;
  },

  modes: (items) => {
    const rows = items.map(m => `<tr><td><code>${esc(m.prefix)}</code></td><td><strong>${esc(m.displayName)}</strong></td><td>${esc(m.mindset)}</td><td>${esc(m.summary)}</td></tr>`).join('');
    return `<div class="facts-block"><table class="facts"><thead><tr><th>Prefix</th><th>Mode</th><th>Mindset</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  personas: (items) => {
    const grouped = groupBy(items, p => p.mode);
    const blocks: string[] = [];
    for (const [mode, personas] of grouped) {
      blocks.push(`<h4>${esc(mode.charAt(0).toUpperCase() + mode.slice(1))} team</h4>`);
      blocks.push('<ol class="persona-list">');
      for (const p of personas.sort((a, b) => a.order - b.order)) {
        blocks.push(`<li><strong>${esc(p.name)}</strong> — ${esc(p.role)}</li>`);
      }
      blocks.push('</ol>');
    }
    return `<div class="facts-block">${blocks.join('')}</div>`;
  },

  permissions: (items) => {
    const categories = Object.keys(items[0].categories) as Array<keyof typeof items[0]['categories']>;
    const headerRow = '<tr><th>Category</th>' + items.map(m => `<th>${esc(m.displayName)}</th>`).join('') + '</tr>';
    const rows = categories.map(c => {
      const label = esc((CATEGORY_LABELS as Record<string, string>)[c] ?? c);
      const cells = items.map(m => `<td><span class="perm perm-${m.categories[c]}">${esc(PERMISSION_LABELS[m.categories[c]])}</span></td>`).join('');
      return `<tr><td><strong>${label}</strong></td>${cells}</tr>`;
    }).join('');
    const summaryRow = '<tr><td></td>' + items.map(m => `<td class="muted small">${esc(m.summary)}</td>`).join('') + '</tr>';
    return `<div class="facts-block"><table class="facts"><thead>${headerRow}</thead><tbody>${rows}${summaryRow}</tbody></table></div>`;
  },

  shortcuts: (items) => {
    const rows = items.map(s => `<tr><td>${esc(s.action)}</td><td><kbd>${esc(s.keysWin)}</kbd><span class="muted"> / </span><kbd>${esc(s.keysMac)}</kbd></td><td>${s.surfaces.map(x => `<span class="surface">${esc(x)}</span>`).join(' ')}</td><td>${esc(s.description)}</td></tr>`).join('');
    return `<div class="facts-block"><table class="facts"><thead><tr><th>Action</th><th>Windows / macOS</th><th>Surface</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  page: (title, blocks, anchor) => {
    return `<section class="doc-page" id="${esc(anchor)}"><h2>${esc(title)}</h2>${blocks.join('\n')}</section>`;
  },

  document: (pages, sidebar) => {
    const sidebarHtml = renderSidebar(sidebar);
    const expandBtn = `<button id="sidebar-expand" class="sidebar-rail" aria-label="Expand sidebar" title="Expand"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>`;
    return `<div class="docs-root"><aside class="sidebar" id="sidebar">${sidebarHtml}</aside>${expandBtn}<main class="content">${pages.join('\n')}</main></div>`;
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Array<[K, T[]]> {
  const map = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(x);
  }
  return Array.from(map.entries());
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function variantLabel(v: 'note' | 'warning' | 'tip'): string {
  return v === 'tip' ? 'Tip' : v === 'warning' ? 'Warning' : 'Note';
}

function renderSidebar(sidebar: SidebarNode[]): string {
  const sections = sidebar.map(section => {
    const items = section.pages.map(p => {
      const audienceClass = p.audience.includes('power') && !p.audience.includes('newcomer') && !p.audience.includes('both')
        ? ' data-audience="power"' : '';
      return `<a class="nav-link" href="#${esc(p.anchor)}"${audienceClass}>${esc(p.title)}</a>`;
    }).join('');
    return `<div class="nav-section"><div class="nav-heading">${esc(section.title)}</div>${items}</div>`;
  }).join('');
  return `<div class="sidebar-header"><strong>Documentation</strong><button id="sidebar-collapse" class="icon-btn" aria-label="Collapse sidebar" title="Collapse"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button></div><label class="toggle"><input type="checkbox" id="toggle-power" checked> Everything</label>${sections}`;
}

// ── Public entry ────────────────────────────────────────────────────────────

/** Render the full documentation corpus to an HTML body fragment for the webview. */
export function renderDocsBody(): string {
  const pages = filterBySurface(getPages(), 'ext');
  const visiblePages = filterByAudience(pages, 'everything'); // Client-side JS toggles power rows
  const sidebar = buildSidebar(visiblePages);

  const data: FactsData = {
    tools: TOOLS,
    providers: PROVIDERS,
    modes: MODES,
    personas: PERSONAS,
    permissions: PERMISSION_MODES,
    shortcuts: SHORTCUTS,
  };

  // Render every page through the shared walker.
  const rendered: string[] = [];
  for (const page of visiblePages) {
    const blocks = page.body.map(block => renderBlockInline(block, data));
    rendered.push(htmlAdapter.page(page.title, blocks, anchorFor(page.id)));
  }

  return htmlAdapter.document(rendered, sidebar, 'ext');
}

// Inline block dispatch — equivalent to renderBlock from core/adapter, but
// lets us avoid the import so esbuild does not need to resolve the deeper
// adapter module at bundle time.
function renderBlockInline(block: DocPage['body'][number], data: FactsData): string {
  switch (block.type) {
    case 'paragraph': return htmlAdapter.paragraph(block.text);
    case 'heading':   return htmlAdapter.heading(block.level, block.text, block.anchor);
    case 'list':      return htmlAdapter.list(block.items, block.ordered);
    case 'code':      return htmlAdapter.code(block.text, block.language);
    case 'callout':   return htmlAdapter.callout(block.text, block.variant);
    case 'link':      return htmlAdapter.link(block.text, block.href, block.external ?? false);
    case 'facts': {
      switch (block.kind) {
        case 'tools': {
          const f = block.filter;
          const filtered = data.tools.filter(t =>
            (!f?.category || t.category === f.category) &&
            (!f?.risk || t.risk === f.risk));
          return htmlAdapter.tools(filtered, block);
        }
        case 'providers': {
          const f = block.filter;
          const filtered = f?.kind ? data.providers.filter(p => p.kind === f.kind) : data.providers;
          return htmlAdapter.providers(filtered, block);
        }
        case 'modes': return htmlAdapter.modes(data.modes);
        case 'personas': {
          const f = block.filter;
          const filtered = f?.mode ? data.personas.filter(p => p.mode === f.mode) : data.personas;
          return htmlAdapter.personas(filtered, block);
        }
        case 'permissions': return htmlAdapter.permissions(data.permissions);
        case 'shortcuts': {
          const f = block.filter;
          const filtered = f?.surface ? data.shortcuts.filter(s => s.surfaces.includes(f.surface!)) : data.shortcuts;
          return htmlAdapter.shortcuts(filtered, block);
        }
      }
    }
  }
}

// ── Styles + client script exported for DocsPanel.ts to embed inline ─────

export const DOCS_CSS = `
    :root {
      --ava-accent: #a78bfa;
      --ava-accent-dim: #7c3aed;
      --ava-bg: var(--vscode-editor-background);
      --ava-fg: var(--vscode-editor-foreground);
      --ava-muted: var(--vscode-descriptionForeground);
      --ava-border: var(--vscode-panel-border, #333);
      --ava-card-bg: var(--vscode-editorWidget-background, #1e1e2e);
      --ava-link: var(--vscode-textLink-foreground, #7c9ff5);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--ava-fg); background: var(--ava-bg); line-height: 1.6; }
    .docs-root { display: flex; min-height: 100vh; }
    .sidebar { width: 220px; min-width: 220px; position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 16px 12px; border-right: 1px solid var(--ava-border); background: var(--ava-card-bg); }
    .sidebar-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--ava-border); }
    .icon-btn { background: transparent; border: none; color: var(--ava-muted); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .icon-btn:hover { color: var(--ava-fg); background: rgba(255,255,255,0.05); }
    .sidebar-rail { display: none; align-self: flex-start; margin-top: 16px; margin-left: 12px; background: var(--ava-card-bg); border: 1px solid var(--ava-border); color: var(--ava-muted); cursor: pointer; padding: 6px; border-radius: 6px; }
    .sidebar-rail:hover { color: var(--ava-fg); border-color: var(--ava-accent); }
    .docs-root.collapsed .sidebar { display: none; }
    .docs-root.collapsed .sidebar-rail { display: flex; }
    .toggle { font-size: 11px; color: var(--ava-muted); display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .nav-section { margin-bottom: 14px; }
    .nav-heading { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ava-muted); margin-bottom: 4px; padding: 0 8px; }
    .nav-link { display: block; padding: 4px 8px; font-size: 12px; color: var(--ava-fg); text-decoration: none; border-radius: 4px; }
    .nav-link:hover { background: var(--ava-accent-dim); color: white; }
    .nav-link[data-audience="power"] { color: var(--ava-muted); }
    .content { flex: 1; min-width: 0; padding: 24px 32px 64px; max-width: 860px; overflow-y: auto; }
    .doc-page { margin-bottom: 48px; }
    .doc-page h2 { font-size: 22px; font-weight: 300; margin-bottom: 12px; color: var(--ava-accent); scroll-margin-top: 16px; }
    .doc-page h3 { font-size: 15px; font-weight: 500; margin-top: 20px; margin-bottom: 8px; }
    .doc-page h4 { font-size: 13px; font-weight: 600; margin-top: 16px; margin-bottom: 6px; color: var(--ava-accent); }
    .doc-page p { margin-bottom: 10px; }
    .doc-page ul, .doc-page ol { margin: 8px 0 12px 20px; }
    .doc-page li { margin-bottom: 4px; }
    .callout { border-left: 3px solid var(--ava-accent); background: var(--ava-card-bg); padding: 10px 14px; margin: 12px 0; border-radius: 4px; font-size: 12px; }
    .callout-warning { border-left-color: #f59e0b; }
    .callout-tip { border-left-color: #10b981; }
    .callout strong { color: var(--ava-accent); }
    .callout-warning strong { color: #f59e0b; }
    .callout-tip strong { color: #10b981; }
    .code { background: var(--ava-card-bg); border: 1px solid var(--ava-border); border-radius: 4px; padding: 10px 12px; margin: 8px 0; overflow-x: auto; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    .facts-block { margin: 12px 0; }
    table.facts { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
    table.facts th, table.facts td { border-bottom: 1px solid var(--ava-border); padding: 6px 8px; text-align: left; vertical-align: top; }
    table.facts th { font-weight: 600; color: var(--ava-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .risk { padding: 1px 6px; border-radius: 3px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .risk-safe { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .risk-write { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .risk-dangerous { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .perm { padding: 1px 6px; border-radius: 3px; font-size: 10px; }
    .perm-auto { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .perm-first_time { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .perm-always_ask { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .cap { padding: 1px 5px; border-radius: 3px; background: var(--ava-card-bg); font-size: 10px; color: var(--ava-muted); }
    .surface { padding: 1px 5px; border-radius: 3px; background: var(--ava-card-bg); font-size: 10px; color: var(--ava-muted); text-transform: lowercase; }
    kbd { background: var(--ava-card-bg); border: 1px solid var(--ava-border); border-radius: 3px; padding: 1px 5px; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
    code { background: var(--ava-card-bg); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
    .persona-list { margin-left: 20px; }
    .persona-list li { margin-bottom: 4px; }
    .muted { color: var(--ava-muted); }
    .small { font-size: 11px; }
    a { color: var(--ava-link); text-decoration: none; }
    a:hover { text-decoration: underline; }
`;

// Client-side: audience toggle, hides power-only sidebar links and their pages.
export const DOCS_SCRIPT = `
(function () {
  const toggle = document.getElementById('toggle-power');
  if (toggle) {
    const apply = () => {
      const showPower = toggle.checked;
      document.querySelectorAll('.nav-link[data-audience="power"]').forEach(el => {
        el.style.display = showPower ? '' : 'none';
      });
    };
    toggle.addEventListener('change', apply);
    apply();
  }

  const root = document.querySelector('.docs-root');
  const collapse = document.getElementById('sidebar-collapse');
  const expand = document.getElementById('sidebar-expand');
  if (collapse && root) collapse.addEventListener('click', () => root.classList.add('collapsed'));
  if (expand && root) expand.addEventListener('click', () => root.classList.remove('collapsed'));
})();
`;
