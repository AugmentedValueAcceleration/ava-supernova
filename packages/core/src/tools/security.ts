import { resolve, isAbsolute, normalize } from 'node:path';

/**
 * Validate that a resolved path stays within the allowed working directory.
 * Prevents path traversal attacks (e.g. ../../etc/passwd).
 *
 * @param rawPath - The user-provided path (absolute or relative)
 * @param cwd - The current working directory (trust boundary)
 * @returns The resolved absolute path
 * @throws Error if the path escapes the working directory
 */
export function validatePath(rawPath: string, cwd: string): string {
  const absolutePath = isAbsolute(rawPath) ? normalize(rawPath) : normalize(resolve(cwd, rawPath));
  const normalizedCwd = normalize(cwd);

  // Allow paths within the cwd
  if (absolutePath.startsWith(normalizedCwd)) {
    return absolutePath;
  }

  // Allow paths within the user's home directory (for ~/.ava config, memory, etc.)
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && absolutePath.startsWith(normalize(home))) {
    return absolutePath;
  }

  throw new Error(
    `Path "${rawPath}" resolves outside the project directory. ` +
    `Access is restricted to "${normalizedCwd}" and the home directory.`
  );
}

/**
 * Validate a directory path for search tools (glob, grep, list_directory).
 * Same rules as validatePath but for directories.
 */
export function validateSearchPath(rawPath: string | undefined, cwd: string): string {
  if (!rawPath) return cwd;
  return validatePath(rawPath, cwd);
}

/**
 * Credential/secret detection patterns.
 * Shared across memory_save, support_request, and any tool that handles user content.
 */
export const SECRET_PATTERNS = [
  /sk[-_](?:live|test|ant|proj)[_-]\S{10,}/i,          // Stripe, Anthropic, OpenAI-style keys
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,       // GitHub tokens
  /\bglpat-[A-Za-z0-9\-_]{20,}/,                        // GitLab PATs
  /\bxox[baprs]-[A-Za-z0-9\-]{20,}/,                    // Slack tokens
  /\beyJ[A-Za-z0-9\-_]{50,}\.[A-Za-z0-9\-_]{50,}/,     // JWT tokens
  /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/,            // AWS access keys
  /\bAIza[A-Za-z0-9\-_]{30,}/,                           // Google API keys
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,       // Private keys (PEM)
];

/**
 * Check if text contains likely credentials or secrets.
 * @returns true if credentials are detected
 */
export function containsCredentials(text: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(text));
}
