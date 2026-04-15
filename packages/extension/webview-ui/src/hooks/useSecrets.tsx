import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SecretEntry } from '../components/SecretVault';
import { findPatternHits } from '../utils/secret-patterns';

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
  const [secrets, setSecretsState] = useState<SecretEntry[]>(() => {
    try {
      const saved = localStorage.getItem('ava-secret-vault');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const setSecrets = useCallback((updated: SecretEntry[]) => {
    setSecretsState(updated);
    try {
      localStorage.setItem('ava-secret-vault', JSON.stringify(updated));
    } catch {}
  }, []);

  // Sync from localStorage changes (in case InputArea writes)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'ava-secret-vault' && e.newValue) {
        try {
          setSecretsState(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Also listen for custom event from InputArea in same window
  useEffect(() => {
    const handler = () => {
      try {
        const saved = localStorage.getItem('ava-secret-vault');
        if (saved) setSecretsState(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener('ava-secrets-changed', handler);
    return () => window.removeEventListener('ava-secrets-changed', handler);
  }, []);

  const redact = useCallback(
    (text: string): string => {
      if (!text) return text;
      let result = text;
      // Pass 1 — known vault values get the bullet mask.
      for (const secret of secrets) {
        if (secret.value.length < 4) continue; // skip very short values
        // Escape regex special chars in the secret value
        const escaped = secret.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), '\u2022\u2022\u2022\u2022\u2022\u2022');
      }
      // Pass 2 — high-confidence patterns (sk-, ghp_, AKIA…) for keys we've
      // never seen. Renders as [REDACTED:kind] so the user knows something
      // was filtered without leaking the value into the chat surface.
      const hits = findPatternHits(result);
      if (hits.length > 0) {
        let out = '';
        let cursor = 0;
        for (const h of hits) {
          if (h.start < cursor) continue; // overlap with prior hit
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

      // Build a list of match positions
      interface Match {
        start: number;
        end: number;
        label: string;
        value: string;
      }
      const matches: Match[] = [];

      // Vault values first.
      for (const secret of secrets) {
        if (secret.value.length < 4) continue;
        let idx = 0;
        while (true) {
          const found = text.indexOf(secret.value, idx);
          if (found === -1) break;
          matches.push({
            start: found,
            end: found + secret.value.length,
            label: secret.label,
            value: secret.value,
          });
          idx = found + secret.value.length;
        }
      }

      // Pattern hits for unknown keys (anthropic/openai/github/aws/etc.).
      for (const h of findPatternHits(text)) {
        matches.push({ start: h.start, end: h.end, label: h.provider || h.kind, value: h.value });
      }

      if (matches.length === 0) return [{ text, isSecret: false }];

      // Sort by position, remove overlaps
      matches.sort((a, b) => a.start - b.start);
      const deduped: Match[] = [];
      for (const m of matches) {
        if (deduped.length === 0 || m.start >= deduped[deduped.length - 1].end) {
          deduped.push(m);
        }
      }

      // Build segments
      const segments: RedactedSegment[] = [];
      let cursor = 0;
      for (const m of deduped) {
        if (m.start > cursor) {
          segments.push({ text: text.slice(cursor, m.start), isSecret: false });
        }
        segments.push({
          text: '\u2022\u2022\u2022\u2022\u2022\u2022',
          isSecret: true,
          secretLabel: m.label,
          originalValue: m.value,
        });
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
