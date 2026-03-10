interface SectionGroupProps {
  label: string;
  description?: string;
  count?: string;
  children: React.ReactNode;
}

/**
 * Groups related dashboard content under a labeled header.
 * Creates clear visual separation between major sections.
 */
export function SectionGroup({ label, description, count, children }: SectionGroupProps) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {label}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {count && (
          <span className="text-xs text-[var(--text-muted)]">{count}</span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
