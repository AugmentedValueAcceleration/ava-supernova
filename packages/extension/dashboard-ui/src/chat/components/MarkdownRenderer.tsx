import React, { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { t, useLocale } from '../../i18n';

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  useLocale();
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = preRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="relative group">
      <pre
        ref={preRef}
        className="rounded p-3 my-2 overflow-x-auto text-xs leading-relaxed
                    bg-[var(--vscode-textCodeBlock-background,rgba(0,0,0,0.15))]"
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px]
                   opacity-0 group-hover:opacity-60 hover:!opacity-100
                   bg-[var(--vscode-button-secondaryBackground)]
                   text-[var(--vscode-button-secondaryForeground)]
                   border-none cursor-pointer transition-opacity"
      >
        {copied ? t('dash.chat.copied_excl') : t('dash.chat.copy_short')}
      </button>
    </div>
  );
}

// Error boundary to prevent malformed markdown from crashing the UI
class MarkdownErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: string }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode; fallback: string }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <pre className="text-xs whitespace-pre-wrap opacity-70">{this.props.fallback}</pre>;
    return this.props.children;
  }
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  useLocale();
  return (
    <MarkdownErrorBoundary fallback={content}>
    <div className="markdown-body space-y-2.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // ── Headings ────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1 className="text-base font-bold mt-4 mb-1.5 pb-1 border-b border-[var(--vscode-panel-border)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => {
            const text = String(children ?? '');
            const isPlan = text.startsWith('Plan:');
            return (
              <h2 className={`text-sm font-bold mt-3.5 mb-1.5 ${isPlan ? 'text-[var(--vscode-textLink-foreground)] border-l-2 border-[var(--vscode-textLink-foreground)] pl-2' : 'pb-0.5 border-b border-[var(--vscode-panel-border)]'}`}>
                {children}
              </h2>
            );
          },
          h3: ({ children }) => (
            <h3 className="text-[13px] font-semibold mt-3 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold mt-2.5 mb-1 opacity-80">
              {children}
            </h4>
          ),

          // ── Paragraphs ──────────────────────────────────────────────────
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed">{children}</p>
          ),

          // ── Lists ───────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="my-1.5 pl-5 space-y-1 list-disc marker:opacity-40">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 pl-5 space-y-1 list-decimal marker:opacity-50">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),

          // ── Blockquotes ─────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 border-l-2 border-[var(--vscode-textLink-foreground)] opacity-80 italic">
              {children}
            </blockquote>
          ),

          // ── Horizontal rules (section dividers) ─────────────────────────
          hr: () => (
            <hr className="my-3 border-none border-t border-[var(--vscode-panel-border)] opacity-30" />
          ),

          // ── Bold / emphasis ─────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),

          // ── Code ────────────────────────────────────────────────────────
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1 py-0.5 rounded text-xs bg-[var(--vscode-textCodeBlock-background,rgba(0,0,0,0.1))]">
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },

          // ── Links ───────────────────────────────────────────────────────
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[var(--vscode-textLink-foreground)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          // ── Tables ──────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="border-collapse text-xs w-full">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--vscode-panel-border)] px-2 py-1.5 text-left font-semibold
                           bg-[var(--vscode-textCodeBlock-background,rgba(0,0,0,0.05))]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--vscode-panel-border)] px-2 py-1.5">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
    </MarkdownErrorBoundary>
  );
}
