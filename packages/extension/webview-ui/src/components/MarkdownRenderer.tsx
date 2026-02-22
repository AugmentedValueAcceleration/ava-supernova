import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Plan headers get accent color
        h2: ({ children }) => {
          const text = String(children ?? '');
          const isPlan = text.startsWith('Plan:');
          return (
            <h2 className={`text-sm font-bold mt-3 mb-1 ${isPlan ? 'text-[var(--vscode-textLink-foreground)] border-l-2 border-[var(--vscode-textLink-foreground)] pl-2' : ''}`}>
              {children}
            </h2>
          );
        },
        // Style code blocks
        pre: ({ children }) => (
          <pre className="rounded p-3 my-2 overflow-x-auto text-xs leading-relaxed">
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
        // Links open externally
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
        // Tables
        table: ({ children }) => (
          <table className="border-collapse my-2 text-xs w-full">
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th className="border border-[var(--vscode-panel-border)] px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--vscode-panel-border)] px-2 py-1">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
