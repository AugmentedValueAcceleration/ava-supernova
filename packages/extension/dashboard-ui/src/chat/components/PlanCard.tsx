import { useState, useEffect } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';

interface PlanCardProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string) => void;
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
  confidence?: 'high' | 'medium' | 'low';
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

// ─── Confidence config ────────────────────────────────────────────────────

// labelKey carries the i18n key, resolved with t() at render time.
const CONFIDENCE = {
  high:   { labelKey: 'plan.confidence.high', color: '#4caf50', bg: 'rgba(76,175,80,0.12)', icon: '\u2714' },
  medium: { labelKey: 'plan.confidence.medium', color: '#ff9800', bg: 'rgba(255,152,0,0.12)', icon: '\u25C6' },
  low:    { labelKey: 'plan.confidence.low', color: '#f44336', bg: 'rgba(244,67,54,0.12)', icon: '\u26A0' },
};

// ─── Status config ────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending_confirmation: {
    color: 'var(--color-accent, #a855f7)',
    bg: 'rgba(168,85,247,0.06)',
    border: 'rgba(168,85,247,0.25)',
    label: '',
    icon: '',
  },
  running: {
    color: 'var(--vscode-textLink-foreground, #3794ff)',
    bg: 'rgba(55,148,255,0.06)',
    border: 'rgba(55,148,255,0.25)',
    label: 'Running',
    icon: '\u21BB',
  },
  success: {
    color: 'var(--vscode-testing-iconPassed, #4caf50)',
    bg: 'rgba(76,175,80,0.06)',
    border: 'rgba(76,175,80,0.25)',
    label: '',
    icon: '\u2713',
  },
  failed: {
    color: 'var(--vscode-testing-iconFailed, #f44336)',
    bg: 'rgba(244,67,54,0.06)',
    border: 'rgba(244,67,54,0.25)',
    label: '',
    icon: '\u2717',
  },
};

// ─── Component ────────────────────────────────────────────────────────────

export function PlanCard({ toolCall, onConfirmation }: PlanCardProps) {
  useLocale();
  const plan = parsePlanArgs(toolCall.arguments);
  const isPending = toolCall.status === 'pending_confirmation';
  const isSuccess = toolCall.status === 'success';
  const isFailed = toolCall.status === 'failed';
  const status = STATUS_CONFIG[toolCall.status] || STATUS_CONFIG.pending_confirmation;

  const [expanded, setExpanded] = useState(isPending || isFailed);
  const [selectedAlt, setSelectedAlt] = useState<string | null>(null);

  useEffect(() => {
    if (toolCall.status === 'pending_confirmation') setExpanded(true);
  }, [toolCall.status]);

  if (!plan) {
    return (
      <div className="rounded-lg border text-xs overflow-hidden opacity-50"
           style={{ borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="px-3 py-2">{t('plan.unavailable')}</div>
      </div>
    );
  }

  const conf = plan.confidence ? CONFIDENCE[plan.confidence] : null;

  return (
    <div className="rounded-lg overflow-hidden text-xs"
         style={{
           border: `1px solid ${status.border}`,
           background: status.bg,
         }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left
                   hover:bg-[rgba(168,85,247,0.04)]
                   transition-colors border-none bg-transparent cursor-pointer
                   text-[var(--vscode-foreground)]"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* Status icon */}
        {status.icon && (
          <span className="text-sm" style={{ color: status.color }}>{status.icon}</span>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-[13px]">{plan.title}</span>
          {isSuccess && <span className="text-[10px] opacity-40 ml-2">{t('plan.approved')}</span>}
          {isFailed && <span className="text-[10px] opacity-40 ml-2">{t('plan.rejected')}</span>}
        </div>

        {/* Step count + confidence */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] opacity-30">{t('plan.step_count', { count: plan.steps.length })}</span>
          {conf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: conf.bg, color: conf.color }}>
              {conf.icon} {t(conf.labelKey)}
            </span>
          )}
          <span className="opacity-20 text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3"
             style={{ borderTop: `1px solid ${status.border}` }}>

          {/* Goal */}
          <div className="pt-2.5">
            <span className="text-[10px] uppercase tracking-wider opacity-30 block mb-1">{t('plan.goal')}</span>
            <span className="opacity-80 text-[12px] leading-relaxed">{plan.goal}</span>
          </div>

          {/* Steps */}
          <div>
            <span className="text-[10px] uppercase tracking-wider opacity-30 block mb-2">{t('plan.steps')}</span>
            <ol className="list-none m-0 p-0 space-y-2">
              {plan.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  {/* Step number */}
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                        style={{
                          background: isSuccess
                            ? 'rgba(76,175,80,0.15)'
                            : isFailed
                            ? 'rgba(244,67,54,0.15)'
                            : 'rgba(168,85,247,0.12)',
                          color: isSuccess
                            ? '#4caf50'
                            : isFailed
                            ? '#f44336'
                            : 'var(--color-accent, #a855f7)',
                        }}>
                    {isSuccess ? '\u2713' : i + 1}
                  </span>
                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <span className="opacity-80 text-[12px] leading-relaxed">{step.description}</span>
                    {step.files && step.files.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {step.files.map((f, fi) => (
                          <span key={fi}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                                style={{
                                  background: 'rgba(168,85,247,0.08)',
                                  color: 'var(--color-accent, #a855f7)',
                                  opacity: 0.7,
                                }}>
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
          <div className="rounded-lg px-3 py-2"
               style={{ background: 'rgba(76,175,80,0.06)', border: '1px solid rgba(76,175,80,0.12)' }}>
            <span className="text-[10px] uppercase tracking-wider block mb-0.5"
                  style={{ color: '#4caf50', opacity: 0.6 }}>
              {t('plan.verification')}
            </span>
            <span className="opacity-70 text-[11px]">{plan.verification}</span>
          </div>

          {/* Alternatives */}
          {isPending && plan.alternatives && plan.alternatives.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider opacity-30 block mb-2">{t('plan.approaches')}</span>
              <div className="space-y-1.5">
                {plan.alternatives.map((alt) => {
                  const selected = selectedAlt === alt.label;
                  return (
                    <button
                      key={alt.label}
                      className="w-full text-left px-3 py-2 rounded-lg border transition-all cursor-pointer
                                 bg-transparent text-[var(--vscode-foreground)]"
                      style={{
                        borderColor: selected ? 'var(--color-accent, #a855f7)' : 'rgba(168,85,247,0.12)',
                        background: selected ? 'rgba(168,85,247,0.06)' : 'transparent',
                      }}
                      onClick={() => setSelectedAlt(selected ? null : alt.label)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                              style={{
                                borderColor: selected ? 'var(--color-accent, #a855f7)' : 'rgba(255,255,255,0.2)',
                              }}>
                          {selected && (
                            <span className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: 'var(--color-accent, #a855f7)' }} />
                          )}
                        </span>
                        <span className="font-medium text-[12px]">{alt.label}</span>
                      </div>
                      <div className="ml-[22px] mt-1 opacity-50 text-[11px] leading-relaxed">{alt.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Approval buttons */}
          {isPending && toolCall.confirmationId && (
            <div className="flex items-center gap-2.5 pt-1">
              <button
                className="px-5 py-2 rounded-lg text-xs font-semibold
                           border-none cursor-pointer transition-all
                           hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                  color: '#fff',
                }}
                onClick={() => onConfirmation(
                  toolCall.confirmationId!,
                  true,
                  undefined,
                  selectedAlt ?? undefined,
                )}
              >
                {t('plan.approve')}
              </button>
              <button
                className="px-5 py-2 rounded-lg text-xs font-medium
                           border cursor-pointer transition-all
                           text-[var(--vscode-foreground)] opacity-50 hover:opacity-80"
                style={{
                  background: 'transparent',
                  borderColor: 'rgba(168,85,247,0.15)',
                }}
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
