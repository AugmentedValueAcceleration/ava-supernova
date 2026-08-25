import { resolve, isAbsolute, normalize, sep } from 'node:path';

/**
 * Check if `candidate` is within `boundary` using proper path separator validation.
 * Prevents sibling directory attacks (e.g. /app accessing /app-secrets).
 */
function isWithinDirectory(candidate: string, boundary: string): boolean {
  const normCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  const normBoundary = process.platform === 'win32' ? boundary.toLowerCase() : boundary;

  // Exact match (the directory itself)
  if (normCandidate === normBoundary) return true;

  // Must start with boundary + separator — prevents /app matching /app-secrets
  const boundaryWithSep = normBoundary.endsWith(sep) ? normBoundary : normBoundary + sep;
  return normCandidate.startsWith(boundaryWithSep);
}

/**
 * Is this an absolute path belonging to a platform we are NOT running on?
 *
 * node:path only understands absolutes for the platform it is running on. On
 * POSIX, isAbsolute('C:\\Windows\\System32\\config\\SAM') is FALSE — backslash
 * is an ordinary filename character there, so resolve() quietly places it
 * INSIDE the project as a single file literally named
 * "C:\Windows\System32\config\SAM".
 *
 * That is contained, and it is not a traversal: nothing escapes the working
 * directory, on either platform. But it is still the wrong answer. A Windows
 * path arriving on a Linux host means something upstream is confused — a model
 * guessing, or a path copied off another machine — and inventing an
 * absurdly-named file is a way of hiding that instead of reporting it. It also
 * makes the same input behave two different ways depending on the host, which
 * for a tool that runs identically on Windows, macOS and Linux is a bug in its
 * own right.
 *
 * So a foreign absolute is refused everywhere, exactly as the native one is.
 * Covers drive letters (C:\... and C:/...) and UNC shares (\\server\share).
 *
 * Found by CI on ubuntu, where tests/tool-adversarial.test.ts had been asserting
 * this all along and had never once run — the workflow was failing at checkout.
 */
export function isForeignAbsolute(rawPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(rawPath) || rawPath.startsWith('\\\\');
}

/**
 * Validate that a resolved path stays within the allowed working directory.
 * Prevents path traversal attacks (e.g. ../../etc/passwd) and sibling directory access.
 *
 * @param rawPath - The user-provided path (absolute or relative)
 * @param cwd - The current working directory (trust boundary)
 * @returns The resolved absolute path
 * @throws Error if the path escapes the working directory
 */
export function validatePath(rawPath: string, cwd: string): string {
  const absolutePath = isAbsolute(rawPath) ? normalize(rawPath) : normalize(resolve(cwd, rawPath));
  const normalizedCwd = normalize(cwd);

  // Checked BEFORE the containment test, because on POSIX this kind of path
  // resolves to somewhere that genuinely IS inside the project and would
  // otherwise be waved through. isAbsolute() is false for it here, which is
  // precisely the trap.
  if (!isAbsolute(rawPath) && isForeignAbsolute(rawPath)) {
    throw new Error(
      `Path "${rawPath}" resolves outside the project directory. ` +
      `Access is restricted to "${normalizedCwd}" and ~/.ava/.`
    );
  }

  // Allow paths strictly within the project directory
  if (isWithinDirectory(absolutePath, normalizedCwd)) {
    return absolutePath;
  }

  // Allow paths strictly within ~/.ava/ (config, memory, feedback — NOT the entire home directory)
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    const avaDir = normalize(resolve(home, '.ava'));
    if (isWithinDirectory(absolutePath, avaDir)) {
      return absolutePath;
    }
  }

  throw new Error(
    `Path "${rawPath}" resolves outside the project directory. ` +
    `Access is restricted to "${normalizedCwd}" and ~/.ava/.`
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
  /\bxox[baprs]-[A-Za-z0-9-]{20,}/,                    // Slack tokens
  /\beyJ[A-Za-z0-9\-_]{50,}\.[A-Za-z0-9\-_]{50,}/,     // JWT tokens
  /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/,            // AWS access keys
  /\bAIza[A-Za-z0-9\-_]{30,}/,                           // Google API keys
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,       // Private keys (PEM)
  /\b(?:postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]{10,}/i,  // Database connection strings
  /\bBearer\s+[A-Za-z0-9\-_.]{20,}/,                    // Bearer tokens (generic)
  /\b(?:password|passwd|pwd)\s*[:=]\s*\S{4,}/i,          // Inline password assignments
  /\b[A-Za-z0-9]{32,}\b(?=.*(?:key|token|secret))/i,    // Long hex/alpha strings near key/token/secret
  /\bsb_[a-z]+_[A-Za-z0-9\-_]{20,}/,                    // Supabase keys
];

/**
 * Check if text contains likely credentials or secrets.
 * @returns true if credentials are detected
 */
export function containsCredentials(text: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(text));
}
