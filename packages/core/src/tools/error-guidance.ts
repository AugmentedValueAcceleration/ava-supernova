/**
 * Error Guidance — turn cryptic environment failures into plain-English help
 * for users who don't read stack traces.
 *
 * When a tool (bash, test_run, git, etc.) fails with output that matches a
 * known pattern, this module returns a short user-facing explanation: what
 * went wrong, how to fix it, and where to download the missing dependency
 * if applicable. The tool prepends this to its own output before returning,
 * so the model naturally surfaces the friendly explanation to the user
 * while still keeping the raw error available for debugging.
 *
 * Add new patterns as we see them in the wild — order matters, more specific
 * patterns first.
 */

interface Guidance {
  /** Short plain-English description of what went wrong. */
  cause: string;
  /** Concrete next step the user should take. */
  fix: string;
  /** Optional download/docs link. */
  link?: string;
}

interface PatternEntry {
  /** Regex tested against the raw tool output. */
  regex: RegExp;
  /** Either a static guidance object, or a builder that uses the regex match. */
  guidance: Guidance | ((match: RegExpMatchArray) => Guidance);
}

// ── Patterns — order matters, most specific first ──────────────────────────

const PATTERNS: PatternEntry[] = [
  // ─── Windows-specific ────────────────────────────────────────────────────

  // Git Bash missing on Windows — surfaces as a COM "class not registered"
  // error when something tries to invoke bash via the Windows registry.
  {
    regex: /class\s+not\s+registered|RegisteredClass|0x80040154|8908_E_CLASSNOTREG/i,
    guidance: {
      cause: "Bash isn't available on this Windows machine — Git for Windows isn't installed. Git for Windows includes the bash shell that I use to run commands.",
      fix: "Install Git for Windows. After install, restart VS Code and try again.",
      link: "https://gitforwindows.org",
    },
  },

  // Windows: 'X' is not recognized as an internal or external command
  {
    regex: /'(\w[\w-]*)'\s+is\s+not\s+recognized\s+as\s+an\s+internal\s+or\s+external\s+command/i,
    guidance: (match) => commandNotFoundGuidance(match[1]),
  },

  // ─── Unix/cross-platform: command not found ──────────────────────────────

  // bash: foo: command not found  /  sh: foo: command not found
  {
    regex: /(?:bash|sh|zsh|fish):\s*(?:line\s+\d+:\s*)?(\w[\w-]*):\s*command\s+not\s+found/i,
    guidance: (match) => commandNotFoundGuidance(match[1]),
  },

  // /bin/sh: 1: foo: not found  (Debian/Alpine variant)
  {
    regex: /\/bin\/(?:sh|bash):\s*\d+:\s*(\w[\w-]*):\s*not\s+found/i,
    guidance: (match) => commandNotFoundGuidance(match[1]),
  },

  // ─── Permissions ─────────────────────────────────────────────────────────

  {
    regex: /\bEACCES\b|permission\s+denied/i,
    guidance: {
      cause: "The command failed because of a file or directory permission issue.",
      fix: "Check that the file or directory you're trying to access is owned by your user and is writable. On Unix, you may need to run with elevated privileges or fix ownership with chown. On Windows, try running VS Code as Administrator if the file is in a protected location.",
    },
  },

  // ─── Port already in use ─────────────────────────────────────────────────

  {
    regex: /\bEADDRINUSE\b|address\s+already\s+in\s+use|port\s+\d+\s+is\s+already\s+in\s+use/i,
    guidance: {
      cause: "Something is already running on the port the command tried to use.",
      fix: "Either stop the existing process on that port, or use a different port. To find what's using a port: on Windows run `netstat -ano | findstr :PORT`, on Mac/Linux run `lsof -i :PORT`.",
    },
  },

  // ─── File / directory not found ──────────────────────────────────────────

  {
    regex: /\bENOENT\b|no\s+such\s+file\s+or\s+directory|cannot\s+find\s+the\s+(?:file|path)\s+specified/i,
    guidance: {
      cause: "A file or directory the command needed doesn't exist at the given path.",
      fix: "Check the path is correct and the file/directory exists. If you expected the command to create it, the parent directory may need to exist first.",
    },
  },

  // ─── Out of memory ───────────────────────────────────────────────────────

  {
    regex: /\bENOMEM\b|out\s+of\s+memory|JavaScript\s+heap\s+out\s+of\s+memory/i,
    guidance: {
      cause: "The process ran out of memory.",
      fix: "Close some applications to free up RAM. For Node.js builds specifically, try increasing the heap with NODE_OPTIONS=\"--max-old-space-size=4096\" before the command.",
    },
  },

  // ─── Network ─────────────────────────────────────────────────────────────

  {
    regex: /\b(?:ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH)\b|network\s+is\s+unreachable|connection\s+refused/i,
    guidance: {
      cause: "A network request failed — the server didn't respond, refused the connection, or you're offline.",
      fix: "Check your internet connection. If you're trying to reach a local service, make sure it's running. If you're behind a firewall or VPN, that may be blocking the connection.",
    },
  },
];

// ── Command-name-specific guidance ─────────────────────────────────────────

/**
 * Map a missing command name to install guidance.
 * Used by both the Windows "is not recognized" matcher and the Unix
 * "command not found" matcher so they produce the same friendly output.
 */
function commandNotFoundGuidance(command: string): Guidance {
  const cmd = command.toLowerCase();
  switch (cmd) {
    case 'git':
      return {
        cause: "Git isn't installed.",
        fix: "Install Git from the official site. On Windows use Git for Windows.",
        link: process.platform === 'win32' ? 'https://gitforwindows.org' : 'https://git-scm.com/downloads',
      };
    case 'bash':
    case 'sh':
      return {
        cause: process.platform === 'win32'
          ? "Bash isn't available on this Windows machine — Git for Windows isn't installed (it provides the bash shell)."
          : "Bash isn't installed.",
        fix: process.platform === 'win32'
          ? "Install Git for Windows, then restart VS Code."
          : "Install bash via your package manager (apt install bash, brew install bash, etc.).",
        link: process.platform === 'win32' ? 'https://gitforwindows.org' : undefined,
      };
    case 'node':
    case 'nodejs':
      return {
        cause: "Node.js isn't installed.",
        fix: "Install Node.js LTS from the official site. npm comes bundled with it.",
        link: 'https://nodejs.org',
      };
    case 'npm':
      return {
        cause: "npm isn't installed (it ships with Node.js).",
        fix: "Install Node.js LTS — npm comes bundled.",
        link: 'https://nodejs.org',
      };
    case 'pnpm':
      return {
        cause: "pnpm isn't installed.",
        fix: "After Node.js is installed, run: npm install -g pnpm",
        link: 'https://pnpm.io/installation',
      };
    case 'yarn':
      return {
        cause: "Yarn isn't installed.",
        fix: "After Node.js is installed, run: npm install -g yarn",
        link: 'https://yarnpkg.com',
      };
    case 'python':
    case 'python3':
      return {
        cause: "Python isn't installed or isn't in your PATH.",
        fix: "Install Python from the official site. On Windows, make sure to tick \"Add Python to PATH\" during install.",
        link: 'https://python.org/downloads',
      };
    case 'pip':
    case 'pip3':
      return {
        cause: "pip isn't installed (it usually ships with Python).",
        fix: "Install Python from the official site — pip comes bundled. If Python is installed but pip isn't, run: python -m ensurepip --upgrade",
        link: 'https://python.org/downloads',
      };
    case 'cargo':
    case 'rustc':
      return {
        cause: "Rust toolchain isn't installed.",
        fix: "Install Rust via rustup — the official installer.",
        link: 'https://rustup.rs',
      };
    case 'go':
      return {
        cause: "Go isn't installed.",
        fix: "Install Go from the official site.",
        link: 'https://go.dev/dl',
      };
    case 'docker':
      return {
        cause: "Docker isn't installed or isn't running.",
        fix: "Install Docker Desktop and make sure it's running. On Linux you can install via your package manager.",
        link: 'https://docker.com/products/docker-desktop',
      };
    case 'java':
    case 'javac':
      return {
        cause: "Java isn't installed.",
        fix: "Install a JDK — Temurin (OpenJDK) is a good free option.",
        link: 'https://adoptium.net',
      };
    case 'dotnet':
      return {
        cause: "The .NET runtime/SDK isn't installed.",
        fix: "Install the .NET SDK from the official site.",
        link: 'https://dotnet.microsoft.com/download',
      };
    default:
      return {
        cause: `The command \`${command}\` isn't installed or isn't in your PATH.`,
        fix: `Install \`${command}\` using your system's package manager, or download it from its official site. If it is installed, check that its location is in your PATH environment variable.`,
      };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the raw output of a failed tool through the pattern library and return
 * a short plain-English explanation if a known error type matches. Returns
 * null if no pattern matches — in which case the caller should just return
 * the raw output unchanged.
 */
export function explainToolError(rawOutput: string): string | null {
  if (!rawOutput) return null;

  for (const entry of PATTERNS) {
    const match = rawOutput.match(entry.regex);
    if (!match) continue;

    const guidance = typeof entry.guidance === 'function'
      ? entry.guidance(match)
      : entry.guidance;

    return formatGuidance(guidance);
  }

  return null;
}

/**
 * Format a guidance object into the user-facing block that gets prepended
 * to the tool output. Kept consistent across all error types so the model
 * learns the shape and presents it the same way every time.
 */
function formatGuidance(g: Guidance): string {
  const lines: string[] = [];
  lines.push(`What went wrong: ${g.cause}`);
  lines.push(`How to fix it: ${g.fix}`);
  if (g.link) lines.push(`Download: ${g.link}`);
  return lines.join('\n');
}

/**
 * Helper for tools to wrap their failure output with guidance if applicable.
 * Returns the original output unchanged if no pattern matches.
 */
export function enrichErrorOutput(rawOutput: string): string {
  const guidance = explainToolError(rawOutput);
  if (!guidance) return rawOutput;
  return [guidance, '', '--- Original error ---', rawOutput].join('\n');
}
