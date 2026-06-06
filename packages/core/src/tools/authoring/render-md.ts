/**
 * DocModel → normalized Markdown.
 *
 * This is the canonicaliser: it writes the model back out as the extended
 * Markdown that md-parse.ts understands, so `parseMarkdown(renderMarkdown(m))`
 * round-trips to the same model. It's used to normalise authored `.md`, and as
 * the `md` render target (e.g. a CLI surface with no docx/pdf peers can still
 * produce a tidy document).
 */

import type { Block, Inline, DocMeta, DocModel, ListItem } from './doc-model.js';

export function renderMarkdown(model: DocModel): string {
  const parts: string[] = [];
  const fm = renderFrontMatter(model.meta);
  if (fm) parts.push(fm);
  for (const block of model.blocks) parts.push(renderBlock(block, ''));

  let out = parts.filter(Boolean).join('\n\n');

  // Footnote definitions go at the very end.
  const fns = model.meta.footnotes;
  if (fns && Object.keys(fns).length) {
    const defs = Object.entries(fns).map(([id, inl]) => `[^${id}]: ${renderInlines(inl)}`);
    out += '\n\n' + defs.join('\n');
  }
  return out + '\n';
}

// ── Front-matter ─────────────────────────────────────────────────────────────

function renderFrontMatter(meta: DocMeta): string {
  const lines: string[] = [];
  if (meta.title) lines.push(`title: ${quoteIfNeeded(meta.title)}`);
  if (meta.subtitle) lines.push(`subtitle: ${quoteIfNeeded(meta.subtitle)}`);
  if (meta.author) lines.push(`author: ${quoteIfNeeded(meta.author)}`);
  if (meta.date) lines.push(`date: ${quoteIfNeeded(meta.date)}`);
  if (meta.styleProfile) lines.push(`style: ${meta.styleProfile}`);
  if (meta.toc) lines.push('toc: true');
  if (meta.brand) {
    const b = meta.brand;
    const pairs: string[] = [];
    if (b.font) pairs.push(`font: ${quoteIfNeeded(b.font)}`);
    if (b.headingColor) pairs.push(`headingColor: "${b.headingColor}"`);
    if (b.bodyColor) pairs.push(`bodyColor: "${b.bodyColor}"`);
    if (b.subtitleColor) pairs.push(`subtitleColor: "${b.subtitleColor}"`);
    if (pairs.length) lines.push(`brand: { ${pairs.join(', ')} }`);
  }
  if (!lines.length) return '';
  return `---\n${lines.join('\n')}\n---`;
}

function quoteIfNeeded(v: string): string {
  return /[:#{}[\]]/.test(v) ? `"${v}"` : v;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function renderBlock(block: Block, indent: string): string {
  switch (block.type) {
    case 'heading':
      return indent + '#'.repeat(block.level) + ' ' + renderInlines(block.inlines);
    case 'paragraph':
      return indent + renderInlines(block.inlines);
    case 'list':
      return renderList(block.items, block.ordered, indent);
    case 'table':
      return renderTable(block);
    case 'blockquote':
      return block.blocks.map(b => prefixLines(renderBlock(b, ''), '> ')).join('\n>\n');
    case 'callout': {
      const head = block.title ? `:::${block.variant}{title="${block.title}"}` : `:::${block.variant}`;
      const inner = block.blocks.map(b => renderBlock(b, '')).join('\n\n');
      return `${head}\n${inner}\n:::`;
    }
    case 'image':
      return indent + `![${block.alt ?? ''}](${block.src})` + (block.width ? `{width=${block.width}}` : '');
    case 'code':
      return '```' + (block.lang ?? '') + '\n' + block.text + '\n```';
    case 'pagebreak':
      return ':::pagebreak';
    case 'hr':
      return '***';
    case 'toc':
      return '[[toc]]';
  }
}

function renderList(items: ListItem[], ordered: boolean, indent: string): string {
  const lines: string[] = [];
  items.forEach((item, i) => {
    const marker = ordered ? `${i + 1}. ` : '- ';
    lines.push(indent + marker + renderInlines(item.inlines));
    if (item.children?.length) {
      const childIndent = indent + ' '.repeat(marker.length);
      for (const child of item.children) {
        lines.push(renderBlock(child, childIndent));
      }
    }
  });
  return lines.join('\n');
}

function renderTable(block: Extract<Block, { type: 'table' }>): string {
  const headers = block.headers.map(h => renderInlines(h));
  const sep = block.headers.map((_, i) => {
    const a = block.align?.[i];
    if (a === 'center') return ':---:';
    if (a === 'right') return '---:';
    if (a === 'left') return ':---';
    return '---';
  });
  const rows = block.rows.map(r => `| ${r.map(c => renderInlines(c)).join(' | ')} |`);
  return [`| ${headers.join(' | ')} |`, `| ${sep.join(' | ')} |`, ...rows].join('\n');
}

function prefixLines(text: string, prefix: string): string {
  return text.split('\n').map(l => prefix + l).join('\n');
}

// ── Inlines ──────────────────────────────────────────────────────────────────

export function renderInlines(inlines: Inline[]): string {
  return inlines.map(renderInline).join('');
}

function renderInline(n: Inline): string {
  switch (n.type) {
    case 'text': return n.text;
    case 'strong': return `**${renderInlines(n.inlines)}**`;
    case 'em': return `*${renderInlines(n.inlines)}*`;
    case 'code': return `\`${n.text}\``;
    case 'link': return `[${renderInlines(n.inlines)}](${n.href})`;
    case 'footnoteRef': return `[^${n.id}]`;
    case 'break': return '  \n';
  }
}
