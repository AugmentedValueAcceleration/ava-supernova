/**
 * High-confidence secret patterns. Mirror of `core/dataset/redactor.ts` so
 * the webview can redact streaming output without depending on @ava/core.
 *
 * Used by useSecrets.redact() to scrub secrets that are NOT yet in the
 * user's vault — defends against Ava echoing a freshly-pasted key, or a
 * tool result that happens to include a key we've never seen.
 */

export interface SecretPattern {
  /** Stable identifier shown in the redaction chip, e.g. 'openai-key'. */
  kind: string;
  /** Friendly provider label used by the auto-detect-on-save flow. */
  provider: string;
  re: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { kind: 'anthropic-key', provider: 'Anthropic',  re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'openai-key',    provider: 'OpenAI',     re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'github-token',  provider: 'GitHub',     re: /\bgh[pso]_[A-Za-z0-9]{20,}\b/g },
  { kind: 'aws-key',       provider: 'AWS',        re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'stripe-secret', provider: 'Stripe',     re: /\bsk_live_[A-Za-z0-9]{24,}\b/g },
  { kind: 'stripe-test',   provider: 'Stripe',     re: /\bsk_test_[A-Za-z0-9]{24,}\b/g },
  { kind: 'sendgrid-key',  provider: 'SendGrid',   re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { kind: 'slack-token',   provider: 'Slack',      re: /\bxox[bpoars]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'jwt',           provider: 'JWT',        re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
];

/** Best-effort provider guess from a raw secret value. Empty string when unknown. */
export function detectProvider(value: string): string {
  for (const p of SECRET_PATTERNS) {
    // Reset lastIndex — these regexes are global so test() is stateful.
    p.re.lastIndex = 0;
    if (p.re.test(value)) return p.provider;
  }
  return '';
}

/** Find every pattern hit in `text`. Returns matches sorted by start. */
export interface PatternHit {
  start: number;
  end: number;
  kind: string;
  provider: string;
  value: string;
}
export function findPatternHits(text: string): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const p of SECRET_PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, kind: p.kind, provider: p.provider, value: m[0] });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}
