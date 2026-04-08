import { useState } from 'react';
import { post } from '../App';

/* ── Types ─────────────────────────────────────────────────────────── */

export interface FullArticle {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string;
  image_url: string | null;
  source_url: string | null;
  source_author: string | null;
  source_publication: string | null;
  sources: Array<{ url: string; title: string; author?: string | null; publication?: string | null }> | null;
  tags: string[] | null;
  reading_time: number | null;
  ai_generated: boolean;
  ava_commentary: string | null;
  priority: string | null;
  view_count: number;
  created_at: string;
}

export interface RelatedArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string;
  image_url: string | null;
  reading_time: number | null;
  created_at: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  'ai-agents':    { label: 'AI Agents',          icon: '🤖' },
  'models':       { label: 'Models & Benchmarks', icon: '🧠' },
  'dev-tools':    { label: 'Developer Tools',     icon: '🛠️' },
  'open-source':  { label: 'Open Source',          icon: '📦' },
  'education':    { label: 'AI Education',         icon: '🎓' },
  'productivity': { label: 'Productivity & AI',    icon: '⚡' },
  'companions':   { label: 'AI Companions',        icon: '💬' },
  'health':       { label: 'Health & Wellness',    icon: '🏥' },
  'enterprise':   { label: 'Enterprise AI',        icon: '🏢' },
  'industry':     { label: 'Industry & Policy',    icon: '📰' },
};

const GRADIENTS = [
  'radial-gradient(ellipse at 20% 50%, rgba(124,58,237,0.2), transparent 60%), linear-gradient(135deg, #1a1a2e, #16213e)',
  'radial-gradient(ellipse at 80% 20%, rgba(167,139,250,0.2), transparent 60%), linear-gradient(135deg, #0f172a, #1e1b4b)',
  'radial-gradient(ellipse at 50% 80%, rgba(192,132,252,0.2), transparent 60%), linear-gradient(135deg, #1a1a2e, #312e81)',
  'radial-gradient(ellipse at 30% 30%, rgba(129,140,248,0.2), transparent 60%), linear-gradient(135deg, #0c0a1d, #1e293b)',
  'radial-gradient(ellipse at 70% 60%, rgba(99,102,241,0.2), transparent 60%), linear-gradient(135deg, #111827, #1e1b4b)',
];

/* ── Markdown → HTML ───────────────────────────────────────────────── */

function renderMarkdown(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m: string, text: string, url: string) => /^(https?:|mailto:|\/|#)/i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : text)
    .replace(/^---$/gm, '<hr />')
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>');

  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)/g, '$1');
  html = html.replace(/(<hr \/>)<\/p>/g, '$1');

  return html;
}

/* ── Component ─────────────────────────────────────────────────────── */

interface Props {
  article: FullArticle;
  related: RelatedArticle[];
  onBack: () => void;
  onNavigateToArticle: (slug: string) => void;
}

export function ArticleReader({ article, related, onBack, onNavigateToArticle }: Props) {
  const [copied, setCopied] = useState(false);

  const cat = article.category ? CATEGORIES[article.category] : null;
  const sources = article.sources || [];
  const tags = article.tags || [];
  const articleHtml = renderMarkdown(article.content || '');
  const gradientIndex = article.slug.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % GRADIENTS.length;

  const articleUrl = `https://ava-supernova.com/news/${article.slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(articleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available in webview */
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-12">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] transition hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to News
      </button>

      {/* Hero image */}
      <div className="relative mb-6 h-36 overflow-hidden rounded-xl">
        {article.image_url ? (
          <img src={article.image_url} alt={article.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: GRADIENTS[gradientIndex] }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--bg-page)]" />
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {cat && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
              {cat.icon} {cat.label}
            </span>
          )}
          {article.priority === 'breaking' && (
            <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-[9px] font-bold text-white">
              BREAKING
            </span>
          )}
          {article.ai_generated && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[9px] font-bold text-[var(--accent)] backdrop-blur-sm">
              AI-Curated
            </span>
          )}
        </div>
      </div>

      {/* Header meta */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <span>{new Date(article.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {article.reading_time && (
          <>
            <span>&middot;</span>
            <span>{article.reading_time} min read</span>
          </>
        )}
        {article.source_publication && (
          <>
            <span>&middot;</span>
            <span>{article.source_publication}</span>
          </>
        )}
      </div>

      {/* Title */}
      <h1 className="mb-2 text-xl font-bold leading-tight text-white">{article.title}</h1>

      {/* Excerpt */}
      {article.excerpt && (
        <p className="mb-4 text-sm text-[var(--text-secondary)]">{article.excerpt}</p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span
              key={tag}
              className="rounded-full border border-[var(--border-card)] px-2 py-0.5 text-[9px] text-[var(--text-secondary)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Share / copy link */}
      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-white"
        >
          {copied ? (
            <>
              <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.07a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.25 9.22" />
              </svg>
              Copy Link
            </>
          )}
        </button>
        <button
          onClick={() => post({ type: 'open_url', url: articleUrl })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-white"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          Open in Browser
        </button>
      </div>

      {/* Source attribution */}
      {(article.source_url || article.source_author || article.source_publication) && (
        <div className="mb-6 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Originally reported
            {article.source_author && <> by <span className="font-medium text-white">{article.source_author}</span></>}
            {article.source_publication && <> at <span className="font-medium text-white">{article.source_publication}</span></>}
          </p>
          {article.source_url && (
            <button
              onClick={() => post({ type: 'open_url', url: article.source_url! })}
              className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            >
              Read the original article
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Article content */}
      <style>{`
        .article-reader h1 { font-size: 1.25rem; font-weight: 700; color: white; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .article-reader h2 { font-size: 1.1rem; font-weight: 600; color: white; margin-top: 1.25rem; margin-bottom: 0.4rem; }
        .article-reader h3 { font-size: 1rem; font-weight: 600; color: white; margin-top: 1rem; margin-bottom: 0.3rem; }
        .article-reader p { margin-bottom: 0.75rem; }
        .article-reader a { color: var(--accent); text-decoration: none; }
        .article-reader a:hover { text-decoration: underline; }
        .article-reader strong { color: white; font-weight: 600; }
        .article-reader ul { list-style-type: disc; padding-left: 1.25rem; margin-bottom: 0.75rem; }
        .article-reader li { margin-bottom: 0.25rem; }
        .article-reader hr { border: none; border-top: 1px solid var(--border-card); margin: 1.25rem 0; }
        .article-reader pre.code-block { background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 0.5rem; padding: 0.75rem; overflow-x: auto; font-size: 0.75rem; margin-bottom: 0.75rem; }
        .article-reader code.inline-code { background: var(--bg-input); border-radius: 0.25rem; padding: 0.1rem 0.3rem; font-size: 0.8em; }
      `}</style>
      <div
        className="article-reader text-[13px] leading-relaxed text-[var(--text-secondary)]"
        dangerouslySetInnerHTML={{ __html: articleHtml }}
      />

      {/* Ava's commentary */}
      {article.ava_commentary && (
        <div className="mt-8 rounded-xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/5 to-[var(--accent)]/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent)] to-purple-400">
              <span className="text-[10px] font-bold text-white">A</span>
            </div>
            <div>
              <p className="text-xs font-bold text-white">Ava's Take</p>
              <p className="text-[9px] text-[var(--text-muted)]">Ava | Supernova Commentary</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{article.ava_commentary}</p>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mt-8 border-t border-[var(--border-card)] pt-6">
          <h2 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">Sources</h2>
          <div className="space-y-2">
            {sources.map((source, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--bg-input)] text-[9px] font-bold text-[var(--text-muted)]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <button
                    onClick={() => post({ type: 'open_url', url: source.url })}
                    className="text-xs font-medium text-[var(--accent)] hover:underline text-left"
                  >
                    {source.title}
                  </button>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {source.author && <>{source.author} — </>}
                    {source.publication}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related articles */}
      {related.length > 0 && (
        <div className="mt-8 border-t border-[var(--border-card)] pt-6">
          <h2 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">Related Articles</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((rel, i) => {
              const relCat = rel.category ? CATEGORIES[rel.category] : null;
              return (
                <button
                  key={rel.id}
                  onClick={() => onNavigateToArticle(rel.slug)}
                  className="group block overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-left transition hover:border-[var(--accent)]/30"
                >
                  <div className="relative h-20 overflow-hidden">
                    {rel.image_url ? (
                      <img src={rel.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0" style={{ background: GRADIENTS[(i + gradientIndex) % GRADIENTS.length] }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    {relCat && (
                      <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm">
                        {relCat.icon} {relCat.label}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <h3 className="text-[11px] font-semibold leading-snug text-white transition group-hover:text-[var(--accent)] line-clamp-2">
                      {rel.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[var(--text-muted)]">
                      {rel.reading_time && <span>{rel.reading_time}m read</span>}
                      {rel.reading_time && <span>&middot;</span>}
                      <span>{new Date(rel.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Transparency notice */}
      <div className="mt-8 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/50 px-3 py-2 text-center text-[10px] text-[var(--text-muted)]">
        {article.ai_generated
          ? 'This article was AI-curated by Ava | Supernova. All credit belongs to the original authors and publications listed above.'
          : 'All credit belongs to the original authors and publications where applicable.'
        }
      </div>
    </div>
  );
}
