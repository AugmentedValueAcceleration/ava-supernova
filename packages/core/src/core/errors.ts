export class AvaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
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
        const base = `Bad request to ${this.provider}.`;
        return detail
          ? `${base} ${detail}`
          : `${base} The request format may be incompatible with this model.`;
      }
      case 401:
        return `Invalid API key for ${this.provider}. Check your key in ~/.ava/config.json`;
      case 402:
        return `Insufficient credits for ${this.provider}. Top up your account balance.`;
      case 403:
        return `Access denied by ${this.provider}. Your API key may lack the required permissions.`;
      case 404:
        return `Model not found on ${this.provider}. The model ID may have changed — run /model to see available models.`;
      case 429:
        return `Rate limited by ${this.provider}. Too many requests — wait a moment and try again.`;
      case 500:
      case 502:
      case 503:
        return `${this.provider} is experiencing issues (${this.statusCode}). Try again in a few moments.`;
      default:
        return this.message;
    }
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
