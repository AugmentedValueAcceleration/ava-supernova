import { useState, useEffect } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';

interface PlanCardProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string) => void;
}

interface PlanStep {
  description: string;
  files?: string[];
}

interface PlanAlternative {
  label: string;
  description: string;
}

interface PlanData {
  title: string;
  goal: string;
  steps: PlanStep[];
  verification: string;
  alternatives?: PlanAlternative[];
}

function parsePlanArgs(argsJson: string): PlanData | null {
  try {
    const parsed = JSON.parse(argsJson);
    if (parsed.title && parsed.goal && Array.isArray(parsed.steps)) {
      return parsed as PlanData;
    }
  } catch { /* malformed */ }
  return null;
}

// ─── Status colors (matches ToolCallCard) ─────────────────────────────────

const STATUS_COLORS = {
  pending_confirmation: 'var(--vscode-editorWarning-foreground, #ff9800)',
  running: 'var(--vscode-textLink-foreground, #3794ff)',
  success: 'var(--vscode-testing-iconPassed, #4caf50)',
  failed: 'var(--vscode-testing-iconFailed, #f44336)',
};

// ─── Component ────────────────────────────────────────────────────────────

export function PlanCard({ toolCall, onConfirmation }: PlanCardProps) {
  useLocale();
  const plan = parsePlanArgs(toolCall.arguments);
  const isPending = toolCall.status === 'pending_confirmation';
  const isSuccess = toolCall.status === 'success';
  const isFailed = toolCall.status === 'failed';

  const [expanded, setExpanded] = useState(isPending || isFailed);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);

  // Auto-expand when status transitions to pending_confirmation
  // (useState initial value only runs on first render)
  useEffect(() => {
    if (toolCall.status === 'pending_confirmation') {
      setExpanded(true);
    }
  }, [toolCall.status]);

  // Fallback if plan args are malformed
  if (!plan) {
    return (
      <div className="rounded border text-xs overflow-hidden"
           style={{ borderColor: STATUS_COLORS[toolCall.status] + '40' }}>
        <div className="px-3 py-2 opacity-60">{t('plan.unavailable')}</div>
      </div>
    );
  }

  const statusIcon = isSuccess ? '\u2713' : isFailed ? '\u2717' : isPending ? '\uD83D\uDCCB' : '';
  const statusColor = STATUS_COLORS[toolCall.status];
  const borderColor = statusColor + '40';

  return (
    <div className="rounded border text-xs overflow-hidden" style={{ borderColor }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left
                   hover:bg-[var(--vscode-list-hoverBackground)]
                   transition-colors border-none bg-transparent cursor-pointer
                   text-[var(--vscode-foreground)]"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${t('plan.prefix', { title: plan.title })} — ${toolCall.status === 'success' ? t('plan.approved') : toolCall.status === 'failed' ? t('plan.rejected') : t('plan.pending')}`}
      >
        <span style={{ color: statusColor }}>{statusIcon}</span>
        <span className="font-semibold text-[13px]">{t('plan.prefix', { title: plan.title })}</span>
        {isSuccess && (
          <span className="text-[10px] opacity-50 ml-1">{t('plan.approved')}</span>
        )}
        {isFailed && (
          <span className="text-[10px] opacity-50 ml-1">{t('plan.rejected')}</span>
        )}
        <span className="ml-auto opacity-30 text-[10px]">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {/* ── Expanded body ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t"
             style={{ borderColor: statusColor + '20' }}>

          {/* Goal */}
          <div className="pt-2">
            <span className="text-[10px] uppercase tracking-wide opacity-40 block mb-0.5">{t('plan.goal')}</span>
            <span className="opacity-80">{plan.goal}</span>
          </div>

          {/* Steps */}
          <div>
            <span className="text-[10px] uppercase tracking-wide opacity-40 block mb-1">{t('plan.steps')}</span>
            <ol className="list-none m-0 p-0 space-y-1.5">
              {plan.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{
                          backgroundColor: statusColor + '15',
                          color: statusColor,
                        }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="opacity-80">{step.description}</span>
                    {step.files && step.files.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {step.files.map((f, fi) => (
                          <span key={fi} className="px-1.5 py-0.5 rounded text-[10px] opacity-50"
                                style={{ backgroundColor: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                            {shortenPath(f)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Verification */}
          <div>
            <span className="text-[10px] uppercase tracking-wide opacity-40 block mb-0.5">{t('plan.verification')}</span>
            <span className="opacity-70">{plan.verification}</span>
          </div>

          {/* Alternatives (only shown during confirmation) */}
          {isPending && plan.alternatives && plan.alternatives.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wide opacity-40 block mb-1">{t('plan.approaches')}</span>
              <div className="space-y-1">
                {plan.alternatives.map((alt) => (
                  <button
                    key={alt.label}
                    className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors cursor-pointer
                                bg-transparent text-[var(--vscode-foreground)]
                                ${selectedAlt === alt.label
                                  ? 'border-[var(--color-accent,var(--vscode-focusBorder))]'
                                  : 'border-[var(--vscode-panel-border)] hover:border-[var(--vscode-focusBorder)]'
                                }`}
                    onClick={() => setSelectedAlt(selectedAlt === alt.label ? null : alt.label)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex-shrink-0 w-3 h-3 rounded-full border-2 flex items-center justify-center"
                            style={{
                              borderColor: selectedAlt === alt.label
                                ? 'var(--color-accent, var(--vscode-focusBorder))'
                                : 'var(--vscode-foreground)',
                              opacity: selectedAlt === alt.label ? 1 : 0.3,
                            }}>
                        {selectedAlt === alt.label && (
                          <span className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: 'var(--color-accent, var(--vscode-focusBorder))' }} />
                        )}
                      </span>
                      <span className="font-medium">{alt.label}</span>
                    </div>
                    <div className="ml-[18px] mt-0.5 opacity-60 text-[11px]">{alt.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Approval buttons */}
          {isPending && toolCall.confirmationId && (
            <div className="flex items-center gap-2 pt-1">
              <button
                className="px-4 py-1.5 rounded text-xs font-medium
                           bg-[var(--vscode-button-background)]
                           text-[var(--vscode-button-foreground)]
                           hover:bg-[var(--vscode-button-hoverBackground)]
                           border-none cursor-pointer"
                onClick={() => onConfirmation(
                  toolCall.confirmationId!,
                  true,
                  undefined,
                  undefined,
                  selectedAlt ?? undefined,
                )}
              >
                {t('plan.approve')}
              </button>
              <button
                className="px-4 py-1.5 rounded text-xs font-medium
                           bg-[var(--vscode-button-secondaryBackground)]
                           text-[var(--vscode-button-secondaryForeground)]
                           hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                           border-none cursor-pointer"
                onClick={() => onConfirmation(toolCall.confirmationId!, false)}
              >
                {t('plan.reject')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}
