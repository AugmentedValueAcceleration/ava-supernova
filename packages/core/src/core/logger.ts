export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) console.debug(`[DEBUG] ${message}`, ...args);
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) console.info(`[INFO] ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) console.warn(`[WARN] ${message}`, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) console.error(`[ERROR] ${message}`, ...args);
  },
};
