/**
 * Security Scanner — automated vulnerability detection
 *
 * Scans for:
 * 1. Dependency vulnerabilities (npm audit equivalent)
 * 2. Hardcoded secrets (API keys, tokens, passwords)
 * 3. Common code vulnerabilities (SQL injection, XSS, command injection)
 *
 * Pure TypeScript — no native dependencies.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';

/* ── Types ──────────────────────────────────────────────────────── */

export interface DependencyVuln {
  package: string;
  version: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cve: string;
  description: string;
  fix: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  type: string;
  preview: string;
}

export interface CodeVuln {
  file: string;
  line: number;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  code: string;
}

export interface ScanReport {
  dependencies: DependencyVuln[];
  secrets: SecretFinding[];
  codeVulns: CodeVuln[];
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    scannedAt: string;
    durationMs: number;
  };
}

/* ── Secret Patterns ────────────────────────────────────────────── */

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'API Key (sk-)', regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'GitHub OAuth', regex: /gho_[a-zA-Z0-9]{36}/g },
  { name: 'GitHub App Token', regex: /ghu_[a-zA-Z0-9]{36}/g },
  { name: 'GitHub Refresh Token', regex: /ghr_[a-zA-Z0-9]{36}/g },
  { name: 'Private Key', regex: /-----BEGIN\s(?:RSA\s|EC\s)?PRIVATE KEY-----/g },
  { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Slack Token', regex: /xox[bpras]-[a-zA-Z0-9-]+/g },
  { name: 'Stripe Key', regex: /sk_live_[a-zA-Z0-9]{20,}/g },
  { name: 'Stripe Publishable', regex: /pk_live_[a-zA-Z0-9]{20,}/g },
  { name: 'SendGrid Key', regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g },
  { name: 'Twilio Key', regex: /SK[a-f0-9]{32}/g },
  { name: 'Supabase Service Role', regex: /sbp_[a-f0-9]{40}/g },
];

/** Variable-name patterns that suggest hardcoded credentials */
const CREDENTIAL_VAR_PATTERN =
  /(?:password|secret|api_key|apiKey|api_secret|apiSecret|access_token|accessToken|private_key|privateKey|auth_token|authToken)\s*[:=]\s*['"`]([^'"`\s]{8,})['"`]/gi;

/* ── Code Vulnerability Patterns ────────────────────────────────── */

interface VulnPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

const CODE_VULN_PATTERNS: VulnPattern[] = [
  // SQL Injection
  {
    name: 'SQL Injection (string concat)',
    regex: /(?:query|execute|raw)\s*\(\s*['"`].*?\$\{/g,
    severity: 'critical',
    description: 'String interpolation in SQL query — use parameterised queries instead',
  },
  {
    name: 'SQL Injection (concat operator)',
    regex: /(?:query|execute|raw)\s*\(\s*['"`].*?\+\s*(?:req|params|query|body|input|user)/gi,
    severity: 'critical',
    description: 'String concatenation with user input in SQL query',
  },
  // XSS
  {
    name: 'XSS (innerHTML)',
    regex: /\.innerHTML\s*=\s*(?!['"`]<)/g,
    severity: 'high',
    description: 'Direct innerHTML assignment — use textContent or sanitise input',
  },
  {
    name: 'XSS (dangerouslySetInnerHTML)',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*(?!DOMPurify|sanitize|purify)/gi,
    severity: 'high',
    description: 'dangerouslySetInnerHTML without visible sanitisation',
  },
  {
    name: 'XSS (document.write)',
    regex: /document\.write\s*\(/g,
    severity: 'medium',
    description: 'document.write can introduce XSS vulnerabilities',
  },
  // Command Injection
  {
    name: 'Command Injection (exec)',
    regex: /(?:exec|execSync)\s*\(\s*(?:`.*\$\{|['"`].*\+\s*(?:req|params|query|body|input|user))/gi,
    severity: 'critical',
    description: 'User input passed to exec — use execFile with argument array instead',
  },
  {
    name: 'Command Injection (spawn shell)',
    regex: /spawn\s*\(\s*['"`](?:sh|bash|cmd|powershell)/gi,
    severity: 'high',
    description: 'Shell spawned directly — validate and sanitise all arguments',
  },
  // Path Traversal
  {
    name: 'Path Traversal',
    regex: /(?:readFile|readFileSync|createReadStream|access|stat)\s*\(\s*(?:req|params|query|body|input|user)/gi,
    severity: 'high',
    description: 'User input used directly in file path — validate and resolve paths',
  },
  {
    name: 'Path Traversal (join unsanitised)',
    regex: /path\.join\s*\([^)]*(?:req\.|params\.|query\.|body\.|input)/gi,
    severity: 'medium',
    description: 'User input in path.join without traversal check',
  },
  // Eval
  {
    name: 'Eval Usage',
    regex: /\beval\s*\(/g,
    severity: 'high',
    description: 'eval() executes arbitrary code — avoid or use safe alternatives',
  },
  {
    name: 'Function Constructor',
    regex: /new\s+Function\s*\(/g,
    severity: 'high',
    description: 'new Function() is equivalent to eval — avoid dynamic code execution',
  },
  // Insecure crypto
  {
    name: 'Weak Hash (MD5)',
    regex: /createHash\s*\(\s*['"`]md5['"`]\s*\)/g,
    severity: 'medium',
    description: 'MD5 is cryptographically broken — use SHA-256 or better',
  },
  {
    name: 'Weak Hash (SHA1)',
    regex: /createHash\s*\(\s*['"`]sha1['"`]\s*\)/g,
    severity: 'low',
    description: 'SHA-1 is deprecated for security use — prefer SHA-256',
  },
  // Insecure randomness
  {
    name: 'Insecure Random',
    regex: /Math\.random\s*\(\s*\)/g,
    severity: 'low',
    description: 'Math.random() is not cryptographically secure — use crypto.randomBytes for secrets',
  },
];

/* ── File Scanning Helpers ──────────────────────────────────────── */

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.php',
  '.vue', '.svelte', '.astro',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out',
  '.turbo', '.cache', 'coverage', '.nyc_output', '__pycache__',
  '.vscode', '.idea', 'vendor',
]);

const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env.example', '.env.template', '.env.sample',
]);

async function walkFiles(
  dir: string,
  extensions: Set<string>,
  results: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        await walkFiles(fullPath, extensions, results);
      }
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      const ext = extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

/* ── Scanner Functions ──────────────────────────────────────────── */

/**
 * Scan dependencies for known vulnerabilities.
 * Reads package.json and checks against known patterns.
 * For full CVE database checking, use `npm audit` — this provides fast heuristic checks.
 */
export async function scanDependencies(projectPath: string): Promise<DependencyVuln[]> {
  const vulns: DependencyVuln[] = [];

  // Find all package.json files
  const packageFiles: string[] = [];

  // Check workspace packages
  async function findAllPackageJsons(rootDir: string): Promise<void> {
    const rootPkg = join(rootDir, 'package.json');
    packageFiles.push(rootPkg);

    // Check packages/ subdirectories
    const packagesDir = join(rootDir, 'packages');
    try {
      const entries = await readdir(packagesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgFile = join(packagesDir, entry.name, 'package.json');
          try {
            await stat(pkgFile);
            packageFiles.push(pkgFile);
          } catch {
            // No package.json here
          }
        }
      }
    } catch {
      // No packages dir
    }
  }

  await findAllPackageJsons(projectPath);

  // Known vulnerable packages (sample — extend as needed)
  const knownVulnerable: Record<string, { below: string; severity: DependencyVuln['severity']; cve: string; description: string; fix: string }[]> = {
    'lodash': [{ below: '4.17.21', severity: 'high', cve: 'CVE-2021-23337', description: 'Prototype pollution in lodash', fix: 'Upgrade to 4.17.21+' }],
    'minimist': [{ below: '1.2.6', severity: 'critical', cve: 'CVE-2021-44906', description: 'Prototype pollution in minimist', fix: 'Upgrade to 1.2.6+' }],
    'node-fetch': [{ below: '2.6.7', severity: 'high', cve: 'CVE-2022-0235', description: 'Exposure of sensitive information', fix: 'Upgrade to 2.6.7+ or 3.1.1+' }],
    'jsonwebtoken': [{ below: '9.0.0', severity: 'high', cve: 'CVE-2022-23529', description: 'Insecure token verification', fix: 'Upgrade to 9.0.0+' }],
    'express': [{ below: '4.19.2', severity: 'medium', cve: 'CVE-2024-29041', description: 'Open redirect vulnerability', fix: 'Upgrade to 4.19.2+' }],
    'axios': [{ below: '1.6.0', severity: 'medium', cve: 'CVE-2023-45857', description: 'SSRF vulnerability', fix: 'Upgrade to 1.6.0+' }],
    'semver': [{ below: '7.5.2', severity: 'medium', cve: 'CVE-2022-25883', description: 'ReDoS vulnerability', fix: 'Upgrade to 7.5.2+' }],
    'tough-cookie': [{ below: '4.1.3', severity: 'medium', cve: 'CVE-2023-26136', description: 'Prototype pollution', fix: 'Upgrade to 4.1.3+' }],
    'xml2js': [{ below: '0.5.0', severity: 'medium', cve: 'CVE-2023-0842', description: 'Prototype pollution', fix: 'Upgrade to 0.5.0+' }],
    'tar': [{ below: '6.1.9', severity: 'high', cve: 'CVE-2021-37713', description: 'Arbitrary file creation/overwrite', fix: 'Upgrade to 6.1.9+' }],
  };

  function isVersionBelow(current: string, threshold: string): boolean {
    const parse = (v: string) => v.replace(/^[^0-9]*/, '').split('.').map(Number);
    const c = parse(current);
    const t = parse(threshold);
    for (let i = 0; i < 3; i++) {
      const cv = c[i] || 0;
      const tv = t[i] || 0;
      if (cv < tv) return true;
      if (cv > tv) return false;
    }
    return false;
  }

  for (const pkgFile of packageFiles) {
    try {
      const content = await readFile(pkgFile, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [name, versionRange] of Object.entries(allDeps)) {
        const version = String(versionRange).replace(/^[\^~>=<\s]+/, '');
        const known = knownVulnerable[name];
        if (known) {
          for (const vuln of known) {
            if (isVersionBelow(version, vuln.below)) {
              vulns.push({
                package: name,
                version,
                severity: vuln.severity,
                cve: vuln.cve,
                description: `${vuln.description} (found in ${relative(projectPath, pkgFile)})`,
                fix: vuln.fix,
              });
            }
          }
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return vulns;
}

/**
 * Scan source files for hardcoded secrets, API keys, tokens, and passwords.
 */
export async function scanSecrets(
  projectPath: string,
  filePatterns?: string[],
): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];
  const allExtensions = filePatterns
    ? new Set(filePatterns.map((p) => (p.startsWith('.') ? p : `.${p}`)))
    : new Set([...SOURCE_EXTENSIONS, '.json', '.yaml', '.yml', '.toml', '.env', '.cfg', '.conf', '.ini']);

  const files = await walkFiles(projectPath, allExtensions);

  for (const filePath of files) {
    // Skip test fixtures, snapshots, lock files
    const rel = relative(projectPath, filePath);
    if (rel.includes('__snapshots__') || rel.includes('fixture') || rel.includes('.test.') || rel.includes('.spec.')) {
      continue;
    }
    // Skip .env.example style files
    if (rel.endsWith('.example') || rel.endsWith('.template') || rel.endsWith('.sample')) {
      continue;
    }

    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        // Only skip if the pattern is in the comment part (still check — secrets in comments are a finding)
      }

      // Check each secret pattern
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(line);
        if (match) {
          // Skip if it's clearly a regex pattern definition or test
          if (line.includes('RegExp') || line.includes('regex') || line.includes('pattern') || line.includes('PATTERN')) {
            continue;
          }
          // Skip placeholder/example values
          if (match[0].includes('xxx') || match[0].includes('your_') || match[0].includes('example')) {
            continue;
          }
          findings.push({
            file: rel,
            line: lineNum,
            type: pattern.name,
            preview: maskSecret(match[0]),
          });
        }
      }

      // Check credential variable patterns
      CREDENTIAL_VAR_PATTERN.lastIndex = 0;
      const credMatch = CREDENTIAL_VAR_PATTERN.exec(line);
      if (credMatch) {
        const value = credMatch[1];
        // Skip common non-secret values
        if (
          value.startsWith('process.env') ||
          value.startsWith('env.') ||
          value === 'undefined' ||
          value === 'null' ||
          value === 'true' ||
          value === 'false' ||
          value.includes('${') ||
          value.startsWith('your_') ||
          value.includes('xxx') ||
          value.includes('placeholder')
        ) {
          continue;
        }
        findings.push({
          file: rel,
          line: lineNum,
          type: 'Hardcoded Credential',
          preview: maskSecret(value),
        });
      }
    }
  }

  return findings;
}

/**
 * Scan source code for common vulnerability patterns:
 * SQL injection, XSS, command injection, path traversal, etc.
 */
export async function scanCodeVulns(projectPath: string): Promise<CodeVuln[]> {
  const findings: CodeVuln[] = [];
  const files = await walkFiles(projectPath, SOURCE_EXTENSIONS);

  for (const filePath of files) {
    const rel = relative(projectPath, filePath);

    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

      for (const pattern of CODE_VULN_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(line)) {
          // Skip test files for low-severity issues
          if (
            (pattern.severity === 'low' || pattern.severity === 'medium') &&
            (rel.includes('.test.') || rel.includes('.spec.') || rel.includes('__tests__'))
          ) {
            continue;
          }

          findings.push({
            file: rel,
            line: lineNum,
            type: pattern.name,
            severity: pattern.severity,
            description: pattern.description,
            code: trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Run all scanners and return a combined report.
 */
export async function runFullScan(projectPath: string): Promise<ScanReport> {
  const startTime = Date.now();

  const [dependencies, secrets, codeVulns] = await Promise.all([
    scanDependencies(projectPath),
    scanSecrets(projectPath),
    scanCodeVulns(projectPath),
  ]);

  const allSeverities = [
    ...dependencies.map((d) => d.severity),
    ...codeVulns.map((v) => v.severity),
    // Secrets are always treated as high severity
    ...secrets.map(() => 'high' as const),
  ];

  const summary = {
    totalFindings: dependencies.length + secrets.length + codeVulns.length,
    critical: allSeverities.filter((s) => s === 'critical').length,
    high: allSeverities.filter((s) => s === 'high').length,
    medium: allSeverities.filter((s) => s === 'medium').length,
    low: allSeverities.filter((s) => s === 'low').length,
    info: allSeverities.filter((s) => s === 'info').length,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  return { dependencies, secrets, codeVulns, summary };
}
