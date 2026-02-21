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
