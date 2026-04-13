/**
 * Defense-in-depth redactor.
 *
 * The taxonomy in `events.ts` already enforces summary-shaped fields
 * (`*_summary`, `*_signature`, counts, enums) — so in theory no raw
 * user text should ever land in a payload. This redactor is the
 * belt-and-braces safety net: if a caller slips up and passes raw
 * text, matching secrets / PII / identifying paths get rewritten to
 * `[REDACTED:<kind>]` before the event hits disk.
 *
 * We redact rather than drop-the-event because false positives would
 * cost us legitimate training examples. Rewriting preserves the row's
 * shape; the sensitive fragment is just anonymised.
 */

const DEFAULT_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  // LLM / API keys
  { kind: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'github-token', re: /\bgh[pso]_[A-Za-z0-9]{20,}\b/g },
  { kind: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },

  // Personal identifiers
  { kind: 'email', re: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g },

  // Home directory paths (user-identifying)
  { kind: 'path-win', re: /[A-Za-z]:\\Users\\[^\\/:"'<>|?\s]+/g },
  { kind: 'path-mac', re: /\/Users\/[^/\s]+/g },
  { kind: 'path-linux', re: /\/home\/[^/\s]+/g },
];

/** Redact a single string. Safe to call on any string, including empty. */
export function redactString(input: string, extraPatterns: readonly string[] = []): string {
  if (!input) return input;
  let out = input;
  for (const { kind, re } of DEFAULT_PATTERNS) {
    out = out.replace(re, `[REDACTED:${kind}]`);
  }
  for (const pat of extraPatterns) {
    try {
      const re = new RegExp(pat, 'g');
      out = out.replace(re, '[REDACTED:custom]');
    } catch {
      // Skip invalid user-supplied regex — never throw from the redactor.
    }
  }
  return out;
}

/**
 * Walk an arbitrary JSON-shaped value and redact every string field.
 * Non-string leaves pass through unchanged. Arrays/objects recurse.
 */
export function redactValue<T>(value: T, extraPatterns: readonly string[] = []): T {
  if (typeof value === 'string') {
    return redactString(value, extraPatterns) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, extraPatterns)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, extraPatterns);
    }
    return out as unknown as T;
  }
  return value;
}
