import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderHealthTracker } from '../src/providers/health-tracker.js';

describe('ProviderHealthTracker', () => {
  let tracker: ProviderHealthTracker;

  beforeEach(() => {
    tracker = new ProviderHealthTracker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Basic tracking ──────────────────────────────────────────────────────

  describe('recording', () => {
    it('records successes with latency', () => {
      tracker.recordSuccess('deepseek', 100);
      tracker.recordSuccess('deepseek', 200);
      const snap = tracker.getSnapshot('deepseek')!;
      expect(snap.successes).toBe(2);
      expect(snap.failures).toBe(0);
      expect(snap.avgLatencyMs).toBe(150);
    });

    it('records failures', () => {
      tracker.recordFailure('zhipu');
      tracker.recordFailure('zhipu');
      const snap = tracker.getSnapshot('zhipu')!;
      expect(snap.failures).toBe(2);
      expect(snap.consecutiveFailures).toBe(2);
    });

    it('returns undefined for unknown provider', () => {
      expect(tracker.getSnapshot('unknown')).toBeUndefined();
    });

    it('resets consecutive failures on success', () => {
      tracker.recordFailure('kimi');
      tracker.recordFailure('kimi');
      tracker.recordSuccess('kimi', 50);
      const snap = tracker.getSnapshot('kimi')!;
      expect(snap.consecutiveFailures).toBe(0);
      expect(snap.failures).toBe(2); // total failures still tracked
      expect(snap.successes).toBe(1);
    });

    it('tracks last failure and success times', () => {
      vi.setSystemTime(new Date('2026-03-12T10:00:00Z'));
      tracker.recordFailure('test');
      vi.setSystemTime(new Date('2026-03-12T10:01:00Z'));
      tracker.recordSuccess('test', 100);

      const snap = tracker.getSnapshot('test')!;
      expect(snap.lastFailureTime).toBe(new Date('2026-03-12T10:00:00Z').getTime());
      expect(snap.lastSuccessTime).toBe(new Date('2026-03-12T10:01:00Z').getTime());
    });
  });

  // ── Circuit breaker ─────────────────────────────────────────────────────

  describe('circuit breaker', () => {
    it('unknown provider is assumed healthy', () => {
      expect(tracker.isHealthy('never-seen')).toBe(true);
    });

    it('stays healthy with fewer than 3 consecutive failures', () => {
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(true);
    });

    it('becomes unhealthy at 3 consecutive failures', () => {
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(false);
    });

    it('recovers after 60s backoff (first trip)', () => {
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(false);

      // Advance 59 seconds — still unhealthy
      vi.advanceTimersByTime(59_000);
      expect(tracker.isHealthy('test')).toBe(false);

      // Advance to 60 seconds — probe window opens
      vi.advanceTimersByTime(1_000);
      expect(tracker.isHealthy('test')).toBe(true);
    });

    it('uses exponential backoff on repeated trips', () => {
      // First trip
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(false);

      // Probe window opens at 60s, probe succeeds
      vi.advanceTimersByTime(60_000);
      tracker.recordSuccess('test', 100);
      expect(tracker.isHealthy('test')).toBe(true);

      // Second trip
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(false);

      // 60s is not enough for second trip — needs 120s
      vi.advanceTimersByTime(60_000);
      expect(tracker.isHealthy('test')).toBe(false);

      vi.advanceTimersByTime(60_000); // total 120s
      expect(tracker.isHealthy('test')).toBe(true);
    });

    it('caps backoff at 5 minutes', () => {
      // Trip the circuit many times to get high tripCount
      for (let trip = 0; trip < 10; trip++) {
        tracker.recordFailure('test');
        tracker.recordFailure('test');
        tracker.recordFailure('test');
        vi.advanceTimersByTime(5 * 60_000); // wait max
        tracker.recordSuccess('test', 50);
      }

      // One more trip — backoff should be capped at 5 min
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');

      vi.advanceTimersByTime(5 * 60_000 - 1);
      expect(tracker.isHealthy('test')).toBe(false);

      vi.advanceTimersByTime(1);
      expect(tracker.isHealthy('test')).toBe(true);
    });

    it('single success resets consecutive failures but backoff grows', () => {
      // First trip (tripCount=1, backoff=60s)
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(false);

      vi.advanceTimersByTime(60_000);
      tracker.recordSuccess('test', 100);
      expect(tracker.isHealthy('test')).toBe(true);
      expect(tracker.getSnapshot('test')!.consecutiveFailures).toBe(0);

      // Second trip (tripCount=2, backoff=120s)
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      expect(tracker.isHealthy('test')).toBe(false);

      vi.advanceTimersByTime(60_000); // not enough
      expect(tracker.isHealthy('test')).toBe(false);

      vi.advanceTimersByTime(60_000); // 120s total
      expect(tracker.isHealthy('test')).toBe(true);
    });
  });

  // ── Snapshots ───────────────────────────────────────────────────────────

  describe('snapshots', () => {
    it('getSnapshots returns all tracked providers', () => {
      tracker.recordSuccess('a', 100);
      tracker.recordSuccess('b', 200);
      tracker.recordFailure('c');
      const snaps = tracker.getSnapshots();
      expect(snaps).toHaveLength(3);
      const names = snaps.map(s => s.provider).sort();
      expect(names).toEqual(['a', 'b', 'c']);
    });

    it('snapshot includes isHealthy flag', () => {
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      tracker.recordFailure('test');
      const snap = tracker.getSnapshot('test')!;
      expect(snap.isHealthy).toBe(false);
    });

    it('avgLatencyMs is 0 when no successes recorded', () => {
      tracker.recordFailure('test');
      const snap = tracker.getSnapshot('test')!;
      expect(snap.avgLatencyMs).toBe(0);
    });
  });

  // ── Reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all stats for a provider', () => {
      tracker.recordSuccess('test', 100);
      tracker.recordFailure('test');
      tracker.reset('test');
      expect(tracker.getSnapshot('test')).toBeUndefined();
      expect(tracker.isHealthy('test')).toBe(true);
    });

    it('does not affect other providers', () => {
      tracker.recordSuccess('a', 100);
      tracker.recordSuccess('b', 200);
      tracker.reset('a');
      expect(tracker.getSnapshot('a')).toBeUndefined();
      expect(tracker.getSnapshot('b')).toBeDefined();
    });
  });
});
