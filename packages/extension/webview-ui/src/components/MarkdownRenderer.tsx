import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
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
          pre: ({ children }) => (
            <pre className="rounded p-3 my-2 overflow-x-auto text-xs leading-relaxed
                            bg-[var(--vscode-textCodeBlock-background,rgba(0,0,0,0.15))]">
              {children}
            </pre>
          ),
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
  );
}
