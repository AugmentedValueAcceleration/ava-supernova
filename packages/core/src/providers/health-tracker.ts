/**
 * In-memory provider health tracker with circuit-breaker logic.
 *
 * Tracks success/failure/latency per provider name. A provider is considered
 * "unhealthy" after 3 consecutive failures and recovers after a backoff period
 * (60s → 120s → 240s → 5min cap). A single success resets the circuit.
 *
 * Session-scoped — no persistence. One instance per CLI session or extension activation.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const BASE_RECOVERY_MS = 60_000;        // 60 seconds
const MAX_RECOVERY_MS = 5 * 60_000;     // 5 minutes
const RECOVERY_BACKOFF_FACTOR = 2;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProviderHealthSnapshot {
  readonly provider: string;
  readonly successes: number;
  readonly failures: number;
  readonly consecutiveFailures: number;
  readonly avgLatencyMs: number;
  readonly lastFailureTime: number | null;
  readonly lastSuccessTime: number | null;
  readonly isHealthy: boolean;
}

interface HealthStats {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  totalLatencyMs: number;
  latencyCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  tripCount: number; // how many times circuit has tripped (for backoff calc)
}

// ── Implementation ───────────────────────────────────────────────────────────

export class ProviderHealthTracker {
  private stats = new Map<string, HealthStats>();

  /** Record a successful API call. Resets the circuit breaker. */
  recordSuccess(provider: string, latencyMs: number): void {
    const s = this.getOrCreate(provider);
    s.successes++;
    s.totalLatencyMs += latencyMs;
    s.latencyCount++;
    s.lastSuccessTime = Date.now();

    // Reset consecutive failures — circuit closes.
    // tripCount is NOT reset so repeated trips use increasing backoff.
    s.consecutiveFailures = 0;
  }

  /** Record a failed API call. May trip the circuit breaker. */
  recordFailure(provider: string, _error?: Error): void {
    const s = this.getOrCreate(provider);
    s.failures++;
    s.consecutiveFailures++;
    s.lastFailureTime = Date.now();

    if (s.consecutiveFailures === CONSECUTIVE_FAILURE_THRESHOLD) {
      s.tripCount++;
    }
  }

  /**
   * Is this provider considered healthy?
   *
   * - Unknown providers → healthy (optimistic).
   * - Fewer than 3 consecutive failures → healthy.
   * - 3+ consecutive failures → unhealthy, unless the backoff period has
   *   elapsed (probe window open).
   */
  isHealthy(provider: string): boolean {
    const s = this.stats.get(provider);
    if (!s) return true; // optimistic — no data means healthy

    if (s.consecutiveFailures < CONSECUTIVE_FAILURE_THRESHOLD) return true;

    // Circuit is open — check if backoff period has elapsed for a probe
    if (s.lastFailureTime === null) return true;

    const backoffMs = Math.min(
      BASE_RECOVERY_MS * Math.pow(RECOVERY_BACKOFF_FACTOR, s.tripCount - 1),
      MAX_RECOVERY_MS,
    );
    const elapsed = Date.now() - s.lastFailureTime;
    return elapsed >= backoffMs;
  }

  /** Get a read-only snapshot of all tracked providers. */
  getSnapshots(): ProviderHealthSnapshot[] {
    const snapshots: ProviderHealthSnapshot[] = [];
    for (const [provider, s] of this.stats) {
      snapshots.push(this.toSnapshot(provider, s));
    }
    return snapshots;
  }

  /** Get a read-only snapshot for a single provider. */
  getSnapshot(provider: string): ProviderHealthSnapshot | undefined {
    const s = this.stats.get(provider);
    if (!s) return undefined;
    return this.toSnapshot(provider, s);
  }

  /** Reset all stats for a provider (e.g., after reconfiguration). */
  reset(provider: string): void {
    this.stats.delete(provider);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private getOrCreate(provider: string): HealthStats {
    let s = this.stats.get(provider);
    if (!s) {
      s = {
        successes: 0,
        failures: 0,
        consecutiveFailures: 0,
        totalLatencyMs: 0,
        latencyCount: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        tripCount: 0,
      };
      this.stats.set(provider, s);
    }
    return s;
  }

  private toSnapshot(provider: string, s: HealthStats): ProviderHealthSnapshot {
    return {
      provider,
      successes: s.successes,
      failures: s.failures,
      consecutiveFailures: s.consecutiveFailures,
      avgLatencyMs: s.latencyCount > 0 ? Math.round(s.totalLatencyMs / s.latencyCount) : 0,
      lastFailureTime: s.lastFailureTime,
      lastSuccessTime: s.lastSuccessTime,
      isHealthy: this.isHealthy(provider),
    };
  }
}
