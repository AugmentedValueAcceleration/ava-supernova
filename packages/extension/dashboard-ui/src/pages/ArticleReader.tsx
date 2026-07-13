import { useState, useEffect, useRef } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';

/* ── Types ─────────────────────────────────────────────────────────── */

/**
 * A cited source. Two shapes exist: the Newsroom's Correspondent writes
 * `{outlet, headline, url}` (core's write_article); the retired Discover
 * pipeline and hand-entered rows use `{publication, title, url}`. Read both —
 * a source that renders as a blank link is worse than citing nothing, because
 * it looks like we cited something and didn't.
 */
export interface NewsSource {
  url: string;
  headline?: string | null;
  outlet?: string | null;
  title?: string | null;
  publication?: string | null;
  author?: string | null;
}

export interface NewsQuote {
  text: string;
  speaker?: string | null;
  outlet?: string | null;
  url?: string | null;
}

/** The spread. Receipts, never a bias rating. */
export interface NewsCoverage {
  independent_sources?: number;
  total_outlets?: number;
  wire?: string;
  not_covering?: string;
  disagreement?: string;
}

/* ── Share targets ──────────────────────────────────────────────────────
   The official brand marks, as each company publishes them. Nothing is
   invented and nothing is approximated: a wrong logo is a small lie, and this
   is the one product where those aren't free.

   Bluesky and Mastodon have no server-side "share this URL" endpoint the way
   LinkedIn does — their compose intents take the whole post as text, so the
   link is appended to the body rather than passed as its own parameter. */
export const SHARE_ICONS: Record<string, string> = {
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  bluesky: 'M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z',
  mastodon: 'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  reddit: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
  hn: 'M0 24V0h24v24H0zM6.951 5.896l4.112 7.708v5.064h1.583v-4.972l4.148-7.799h-1.749l-2.457 4.875c-.372.745-.688 1.434-.688 1.434s-.297-.708-.651-1.434L8.831 5.896h-1.88z',
};

/**
 * Where an article can be shared.
 *
 * X, Bluesky, LinkedIn, Reddit and HN all take the post as URL parameters, so
 * one click lands you in a pre-filled composer.
 *
 * mu.social does NOT. It looks like a Mastodon address but it's an AT Protocol
 * app, and it ships no compose intent — `/share?text=` (the Mastodon route) is
 * silently swallowed by its single-page router, which is why the post never
 * appeared. No URL will pre-fill it. So rather than a button that quietly does
 * nothing, we copy the post to the clipboard and open the composer: `copyFirst`
 * marks that. One paste instead of one click, and it actually works.
 */
export interface ShareTarget { key: string; label: string; url: string; copyFirst?: string }

export function shareTargets(title: string, url: string): ShareTarget[] {
  const post = `${title}\n\n${url}`;
  const withLink = encodeURIComponent(post);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { key: 'x', label: 'X', url: `https://x.com/intent/tweet?text=${t}&url=${u}` },
    { key: 'bluesky', label: 'Bluesky', url: `https://bsky.app/intent/compose?text=${withLink}` },
    { key: 'mastodon', label: 'mu.social', url: 'https://mu.social/', copyFirst: post },
    { key: 'linkedin', label: 'LinkedIn', url: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { key: 'reddit', label: 'Reddit', url: `https://reddit.com/submit?url=${u}&title=${t}` },
    { key: 'hn', label: 'Hacker News', url: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}` },
  ];
}

export const srcHeadline = (s: NewsSource) => s.headline || s.title || s.url;
export const srcOutlet = (s: NewsSource) => {
  if (s.outlet) return s.outlet;
  if (s.publication) return s.publication;
  try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

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
  sources: NewsSource[] | null;
  quotes: NewsQuote[] | null;
  coverage: NewsCoverage | null;
  unverified: string[] | null;
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

// Mirrors packages/web/src/lib/news-categories.ts — IDs MUST match it.
const CATEGORIES: Record<string, { label: string; icon: string }> = {
  'ai':               { label: 'AI',                 icon: '🤖' },
  'technology':       { label: 'Technology',         icon: '💻' },
  'open-source':      { label: 'Open Source',        icon: '📦' },
  'security-privacy': { label: 'Security & Privacy', icon: '🛡️' },
  'world':            { label: 'World News',         icon: '🌍' },
  'sport':            { label: 'Sport',              icon: '⚽' },
  'business':         { label: 'Business & Economy', icon: '📈' },
  'science':          { label: 'Science',            icon: '🔬' },
  'health':           { label: 'Health & Fitness',   icon: '🩺' },
  'food':             { label: 'Food & Nutrition',   icon: '🍳' },
  'education':        { label: 'Education',          icon: '🎓' },
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
  useLocale();
  const [copied, setCopied] = useState(false);
  const [sharePasted, setSharePasted] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to top when article changes
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
    // Also scroll the parent overflow container and window
    containerRef.current?.closest('[style*="overflow"]')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [article.slug]);

  const cat = article.category ? CATEGORIES[article.category] : null;
  const sources = article.sources || [];
  const quotes = article.quotes || [];
  const coverage = article.coverage || null;
  const unverified = article.unverified || [];
  const tags = article.tags || [];

  // The number that means something vs the number that flatters. When more
  // outlets carry it than there are independent reports, the surplus is the
  // same copy echoed — and the reader is entitled to know which they're seeing.
  const indep = coverage?.independent_sources;
  const total = coverage?.total_outlets;
  const echoed = typeof indep === 'number' && typeof total === 'number' && total > indep;
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
    <div ref={containerRef} className="w-full pb-12">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] transition hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {t('dash.article.back_to_news')}
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
              {t('dash.article.breaking')}
            </span>
          )}
          {article.ai_generated && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[9px] font-bold text-[var(--accent)] backdrop-blur-sm">
              {t('dash.article.ai_curated')}
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
            <span>{t('news.min_read', { n: article.reading_time })}</span>
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
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {shareTargets(article.title, articleUrl).map(target => (
          <button
            key={target.key}
            onClick={async () => {
              // mu.social can't be pre-filled — put the post on the clipboard so
              // the composer is one paste away, and SAY so rather than leaving
              // the operator wondering why nothing appeared.
              if (target.copyFirst) {
                try { await navigator.clipboard.writeText(target.copyFirst); } catch { /* clipboard denied */ }
                setSharePasted(target.key);
                setTimeout(() => setSharePasted(null), 2500);
              }
              post({ type: 'open_url', url: target.url });
            }}
            title={target.copyFirst ? 'Copies the post — paste it into the composer' : target.label}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-white"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d={SHARE_ICONS[target.key]} />
            </svg>
            {sharePasted === target.key ? 'Copied — paste it' : target.label}
          </button>
        ))}
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-1.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-white"
        >
          {copied ? (
            <>
              <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {t('dash.article.copied')}
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.07a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.25 9.22" />
              </svg>
              {t('dash.article.copy_link')}
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
          {t('dash.article.open_in_browser')}
        </button>
      </div>

      {/* Source attribution */}
      {(article.source_url || article.source_author || article.source_publication) && (
        <div className="mb-6 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            {t('dash.article.originally_reported')}
            {article.source_author && <> {t('dash.article.by')} <span className="font-medium text-white">{article.source_author}</span></>}
            {article.source_publication && <> {t('dash.article.at')} <span className="font-medium text-white">{article.source_publication}</span></>}
          </p>
          {article.source_url && (
            <button
              onClick={() => post({ type: 'open_url', url: article.source_url! })}
              className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            >
              {t('dash.article.read_original')}
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
              <p className="text-xs font-bold text-white">{t('dash.article.avas_take')}</p>
              <p className="text-[9px] text-[var(--text-muted)]">{t('dash.article.commentary')}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{article.ava_commentary}</p>
        </div>
      )}

      {/* What we could not verify — published, in plain sight, never buried.
          "I couldn't stand this up" is a publishable sentence. A confident
          false claim is not. */}
      {unverified.length > 0 && (
        <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            {t('dash.article.unverified')}
          </p>
          {unverified.map((claim, i) => (
            <p key={i} className="text-xs leading-relaxed text-[var(--text-secondary)]">— {claim}</p>
          ))}
        </div>
      )}

      {/* The coverage — receipts, never a rating. We don't score outlets left or
          right: that's a contested political judgement and it isn't ours to make.
          We show who reported it, who didn't, and where they disagree. */}
      {coverage && (typeof indep === 'number' || coverage.disagreement || coverage.not_covering) && (
        <div className="mt-8 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t('dash.article.coverage')}
          </p>
          {typeof indep === 'number' && (
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              {t('dash.article.coverage_line', {
                n: indep,
                pieces: t(indep === 1 ? 'dash.article.piece' : 'dash.article.pieces'),
                m: total ?? indep,
                outlets: t((total ?? indep) === 1 ? 'dash.article.outlet' : 'dash.article.outlets'),
              })}
              {echoed && (
                <span className="text-amber-400">
                  {' '}
                  {coverage.wire
                    ? t('dash.article.echoed_wire', { wire: coverage.wire })
                    : t('dash.article.echoed')}
                </span>
              )}
            </p>
          )}
          {coverage.disagreement && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{t('dash.article.differ')}: </span>
              {coverage.disagreement}
            </p>
          )}
          {coverage.not_covering && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{t('dash.article.not_covering')}: </span>
              {coverage.not_covering}
            </p>
          )}
        </div>
      )}

      {/* Quotes — each one checked, word for word, against the source text. */}
      {quotes.length > 0 && (
        <div className="mt-8 border-t border-[var(--border-card)] pt-6">
          <h2 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">{t('dash.article.quotes')}</h2>
          <div className="space-y-3">
            {quotes.map((q, i) => (
              <blockquote key={i} className="border-l-2 border-[var(--accent)] pl-3">
                <p className="text-xs italic leading-relaxed text-white">&ldquo;{q.text}&rdquo;</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {q.speaker && <>{q.speaker} — </>}
                  {q.url ? (
                    <button
                      onClick={() => post({ type: 'open_url', url: q.url! })}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {q.outlet || 'source'}
                    </button>
                  ) : (
                    q.outlet
                  )}
                </p>
              </blockquote>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mt-8 border-t border-[var(--border-card)] pt-6">
          <h2 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">{t('dash.article.sources')}</h2>
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
                    {srcHeadline(source)}
                  </button>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {source.author && <>{source.author} — </>}
                    {srcOutlet(source)}
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
          <h2 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">{t('dash.article.related')}</h2>
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
                      {rel.reading_time && <span>{t('dash.article.m_read', { n: rel.reading_time })}</span>}
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
          ? t('dash.article.transparency_ai')
          : t('dash.article.transparency_default')
        }
      </div>
    </div>
  );
}
