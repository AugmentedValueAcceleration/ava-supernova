import type { ContextThresholds } from './types.js';

const DEFAULT_THRESHOLDS: ContextThresholds = {
  warning: 0.80,
  critical: 0.90,
};

/**
 * Monitors a spawned agent's context usage and triggers callbacks
 * when thresholds are hit. Used by AutoCoordinator to inject
 * safe-pause messages before an agent crashes into its context limit.
 */
export class ContextTracker {
  private modelContextWindow: number;
  private currentUsedTokens = 0;
  private thresholds: ContextThresholds;
  private warningFired = false;
  private criticalFired = false;

  onWarning?: () => void;
  onCritical?: () => void;

  constructor(
    modelContextWindow: number,
    thresholds?: Partial<ContextThresholds>,
  ) {
    this.modelContextWindow = modelContextWindow;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /** Update with latest context usage from a context_usage agent event */
  update(usedTokens: number): void {
    this.currentUsedTokens = usedTokens;
    const ratio = this.getRatio();

    if (!this.warningFired && ratio >= this.thresholds.warning) {
      this.warningFired = true;
      this.onWarning?.();
    }

    if (!this.criticalFired && ratio >= this.thresholds.critical) {
      this.criticalFired = true;
      this.onCritical?.();
    }
  }

  /** Current usage as a 0-1 ratio */
  getRatio(): number {
    if (this.modelContextWindow <= 0) return 0;
    return this.currentUsedTokens / this.modelContextWindow;
  }

  /** Percentage string for display */
  getPercentage(): string {
    return `${Math.round(this.getRatio() * 100)}%`;
  }

  /** Whether the critical threshold has been hit */
  isCritical(): boolean {
    return this.criticalFired;
  }

  /** Reset for reuse (e.g., new agent spawn) */
  reset(): void {
    this.currentUsedTokens = 0;
    this.warningFired = false;
    this.criticalFired = false;
  }
}
