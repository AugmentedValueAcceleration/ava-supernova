import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SecretEntry } from '../components/SecretVault';
import { post } from '../../App';
import { findPatternHits } from '../../utils/secret-patterns';

interface SecretsContextValue {
  secrets: SecretEntry[];
  setSecrets: (secrets: SecretEntry[]) => void;
  /** Replaces secret values in text with masked dots */
  redact: (text: string) => string;
  /** Returns the redacted text plus metadata about which ranges are secrets */
  redactWithMeta: (text: string) => RedactedSegment[];
}

export interface RedactedSegment {
  text: string;
  isSecret: boolean;
  secretLabel?: string;
  originalValue?: string;
}

const SecretsContext = createContext<SecretsContextValue>({
  secrets: [],
  setSecrets: () => {},
  redact: (text) => text,
  redactWithMeta: (text) => [{ text, isSecret: false }],
});

export function SecretsProvider({ children }: { children: ReactNode }) {
  const [secrets, setSecretsState] = useState<SecretEntry[]>([]);

  // Load secrets from extension host on mount
  useEffect(() => {
    post({ type: 'load_secrets' });
  }, []);

  // Listen for secrets from extension host
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'secrets_loaded' && Array.isArray(msg.secrets)) {
        setSecretsState(msg.secrets);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const setSecrets = useCallback((updated: SecretEntry[]) => {
    setSecretsState(updated);
    // Persist via extension host (VS Code SecretStorage)
    post({ type: 'save_secrets', secrets: updated });
    window.dispatchEvent(new CustomEvent('ava-secrets-changed'));
  }, []);

  const redact = useCallback(
    (text: string): string => {
      if (!text) return text;
      let result = text;
      // Pass 1 — known vault values get the bullet mask.
      for (const secret of secrets) {
        if (secret.value.length < 4) continue;
        const escaped = secret.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), '\u2022\u2022\u2022\u2022\u2022\u2022');
      }
      // Pass 2 — high-confidence patterns for keys we've never seen.
      const hits = findPatternHits(result);
      if (hits.length > 0) {
        let out = '';
        let cursor = 0;
        for (const h of hits) {
          if (h.start < cursor) continue;
          out += result.slice(cursor, h.start);
          out += `[REDACTED:${h.kind}]`;
          cursor = h.end;
        }
        out += result.slice(cursor);
        result = out;
      }
      return result;
    },
    [secrets],
  );

  const redactWithMeta = useCallback(
    (text: string): RedactedSegment[] => {
      if (!text) return [{ text, isSecret: false }];

      interface Match { start: number; end: number; label: string; value: string; }
      const matches: Match[] = [];

      for (const secret of secrets) {
        if (secret.value.length < 4) continue;
        let idx = 0;
        while (true) {
          const found = text.indexOf(secret.value, idx);
          if (found === -1) break;
          matches.push({ start: found, end: found + secret.value.length, label: secret.label, value: secret.value });
          idx = found + secret.value.length;
        }
      }

      // Pattern hits for unknown keys.
      for (const h of findPatternHits(text)) {
        matches.push({ start: h.start, end: h.end, label: h.provider || h.kind, value: h.value });
      }

      if (matches.length === 0) return [{ text, isSecret: false }];

      matches.sort((a, b) => a.start - b.start);
      const deduped: Match[] = [];
      for (const m of matches) {
        if (deduped.length === 0 || m.start >= deduped[deduped.length - 1].end) {
          deduped.push(m);
        }
      }

      const segments: RedactedSegment[] = [];
      let cursor = 0;
      for (const m of deduped) {
        if (m.start > cursor) {
          segments.push({ text: text.slice(cursor, m.start), isSecret: false });
        }
        segments.push({ text: '\u2022\u2022\u2022\u2022\u2022\u2022', isSecret: true, secretLabel: m.label, originalValue: m.value });
        cursor = m.end;
      }
      if (cursor < text.length) {
        segments.push({ text: text.slice(cursor), isSecret: false });
      }

      return segments;
    },
    [secrets],
  );

  return (
    <SecretsContext.Provider value={{ secrets, setSecrets, redact, redactWithMeta }}>
      {children}
    </SecretsContext.Provider>
  );
}

export function useSecrets() {
  return useContext(SecretsContext);
}
