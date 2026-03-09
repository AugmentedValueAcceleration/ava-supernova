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
        // Surface the actual error detail from the provider — essential for diagnosis
        let detail = '';
        if (this.responseBody) {
          try {
            const raw = typeof this.responseBody === 'string' ? this.responseBody : '';
            const body = raw ? JSON.parse(raw) : this.responseBody;
            detail = body?.error?.message || body?.message || '';
          } catch {
            // responseBody wasn't JSON — use it as-is (truncated)
            detail = typeof this.responseBody === 'string'
              ? this.responseBody.slice(0, 200)
              : '';
          }
        }
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
        return t('error.msg.rate_limit', { provider: this.provider })
          + ' Retries exhausted — the provider may have very strict rate limits on this model.';
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
