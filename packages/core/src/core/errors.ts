import { t } from '../i18n/index.js';

export class AvaError extends Error {
  code: string;

  constructor(
    message: string,
    code: string,
    options?: { cause?: Error },
  ) {
    super(message, options);
    this.code = code;
    this.name = 'AvaError';
  }
}

/**
 * Dig the actual sentence out of a provider error body.
 *
 * The platform wraps the upstream error in its own JSON, so what arrives is
 * a string containing more JSON containing the message:
 *
 *   {"error":"Provider mistral returned 400: {\"message\":\"Expected last
 *    role User or Tool...\",\"type\":\"invalid_request_message_order\"}"}
 *
 * A single JSON.parse leaves `error` as a STRING, so `body.error.message` is
 * undefined and the old reader gave up and showed the whole blob. This peels
 * layers until it finds a message field, which is why the user was shown
 * nested escaped JSON instead of a sentence.
 */
function deepestProviderMessage(body: unknown, depth = 0): string {
  if (depth > 4 || body == null) return '';
  if (typeof body === 'string') {
    const s = body.trim();
    // A string that contains embedded JSON: parse from the first brace.
    const brace = s.indexOf('{');
    if (brace >= 0) {
      try {
        return deepestProviderMessage(JSON.parse(s.slice(brace)), depth + 1) || s;
      } catch { /* not JSON after all — fall through to the raw string */ }
    }
    return s;
  }
  if (typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'error_message']) {
      if (key in o) {
        const found = deepestProviderMessage(o[key], depth + 1);
        if (found) return found;
      }
    }
  }
  return '';
}

/**
 * Turn a known upstream complaint into something a non-programmer can read.
 *
 * The audience matters here. People are arriving through AI who have never
 * seen a stack trace, and a wall of escaped JSON tells them only that
 * something broke and not whether they caused it. Each line says what
 * happened, whose fault it is, and what to do — in that order. Returns null
 * when we do not recognise it, so an unknown error still shows its real text
 * rather than a comforting guess.
 */
function explainBadRequest(detail: string): string | null {
  const d = detail.toLowerCase();

  if (d.includes('last role') || d.includes('invalid_request_message_order')) {
    return 'The conversation got out of order and the model refused it. '
      + "That's a bug on our side, not something you did — sending your message again usually goes straight through.";
  }
  if (d.includes('context length') || d.includes('too many tokens') || d.includes('maximum context')) {
    return 'This conversation has grown longer than the model can hold. '
      + 'Start a new chat, or ask Ava to compress this one — the important parts carry over.';
  }
  if (d.includes('image') && (d.includes('not support') || d.includes('unsupported'))) {
    return "The model you're using can't see images. "
      + 'Pick a model with vision, or describe the picture in words.';
  }
  if (d.includes('reasoning_content') || d.includes('extra_forbidden')) {
    return 'Ava sent a field this model rejects. '
      + "That's ours to fix — try again, and if it keeps happening, switch model for now.";
  }
  return null;
}

export class ProviderError extends AvaError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown,
  ) {
    super(message, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }

  get humanMessage(): string {
    switch (this.statusCode) {
      case 400: {
        const detail = deepestProviderMessage(this.responseBody);
        // Say what happened in words a person can act on, and say whose fault
        // it is. Most people meeting these are not programmers — a raw
        // provider blob tells them nothing except that something is broken and
        // they cannot tell whether they caused it.
        const plain = explainBadRequest(detail);
        if (plain) return plain;
        return detail
          ? `Bad request to ${this.provider}. ${detail}`
          : t('error.msg.bad_request', { provider: this.provider });
      }
      case 401:
        return t('error.msg.auth', { provider: this.provider });
      case 402:
        return t('error.msg.credits', { provider: this.provider });
      case 403:
        return t('error.msg.forbidden', { provider: this.provider });
      case 404:
        return t('error.msg.model_not_found', { provider: this.provider });
      case 429:
        return t('error.msg.rate_limit', { provider: this.provider });
      case 500:
      case 502:
      case 503: {
        let detail = '';
        if (this.responseBody) {
          try {
            const raw = typeof this.responseBody === 'string' ? this.responseBody : '';
            const body = raw ? JSON.parse(raw) : this.responseBody;
            detail = body?.error?.message || body?.error || body?.message || '';
            if (typeof detail !== 'string') detail = JSON.stringify(detail);
          } catch {
            detail = typeof this.responseBody === 'string'
              ? this.responseBody.slice(0, 200)
              : '';
          }
        }
        const base = t('error.msg.server_error', { provider: this.provider, code: String(this.statusCode) });
        return detail ? `${base} (${detail})` : base;
      }
      default:
        return this.message;
    }
  }

  /** Whether this error is transient and worth retrying. */
  get retryable(): boolean {
    if (!this.statusCode) return true; // network errors are likely transient
    return [429, 500, 502, 503].includes(this.statusCode);
  }
}

export class ToolExecutionError extends AvaError {
  constructor(
    message: string,
    public readonly toolName: string,
  ) {
    super(message, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}

export class ConfigError extends AvaError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class StreamError extends ProviderError {
  constructor(
    message: string,
    provider: string,
    public readonly partialContent?: string,
  ) {
    super(message, provider);
    this.name = 'StreamError';
    this.code = 'STREAM_ERROR';
  }
}
