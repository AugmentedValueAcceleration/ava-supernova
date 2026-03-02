import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProjectIndex {
  version: 1;
  scannedAt: string;
  root: string;
  framework: FrameworkInfo;
  languages: LanguageStats[];
  entryPoints: string[];
  structure: DirectoryNode;
  testInfo: TestInfo;
  buildTools: string[];
  packageManager: string | null;
  keyFiles: string[];
}

export interface FrameworkInfo {
  name: string | null;
  version: string | null;
  type: 'frontend' | 'backend' | 'fullstack' | 'library' | 'cli' | 'unknown';
}

export interface LanguageStats {
  language: string;
  files: number;
  extensions: string[];
}

export interface DirectoryNode {
  name: string;
  type: 'dir' | 'file';
  children?: DirectoryNode[];
  fileCount?: number;
}

export interface TestInfo {
  framework: string | null;
  configFile: string | null;
  testDirs: string[];
  testPattern: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_DEPTH = 4;
const INDEX_FILENAME = 'project-index.json';
const STALE_MS = 60 * 60 * 1000; // 1 hour

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
  '.next', '.nuxt', '.svelte-kit', 'coverage', '.cache', '.turbo',
  '.parcel-cache', '.venv', 'venv', 'env', '.tox', 'target',
  '.idea', '.vscode', '.ava',
]);

const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  '.DS_Store', 'Thumbs.db',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.o', '.obj',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.min.js', '.bundle.js', '.map',
]);

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c': 'c', '.h': 'c',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.dart': 'dart',
  '.lua': 'lua',
  '.r': 'r', '.R': 'r',
  '.scala': 'scala',
  '.zig': 'zig',
  '.ex': 'elixir', '.exs': 'elixir',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.ps1': 'powershell',
  '.dockerfile': 'docker',
};

// ── Framework detection rules ────────────────────────────────────────────────

interface FrameworkRule {
  name: string;
  type: FrameworkInfo['type'];
  deps?: string[];
  files?: string[];
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  // Frontend
  { name: 'next.js', type: 'fullstack', deps: ['next'] },
  { name: 'nuxt', type: 'fullstack', deps: ['nuxt', 'nuxt3'] },
  { name: 'sveltekit', type: 'fullstack', deps: ['@sveltejs/kit'] },
  { name: 'remix', type: 'fullstack', deps: ['@remix-run/react'] },
  { name: 'react', type: 'frontend', deps: ['react'] },
  { name: 'vue', type: 'frontend', deps: ['vue'] },
  { name: 'angular', type: 'frontend', deps: ['@angular/core'] },
  { name: 'svelte', type: 'frontend', deps: ['svelte'] },
  { name: 'solid', type: 'frontend', deps: ['solid-js'] },
  // Backend
  { name: 'express', type: 'backend', deps: ['express'] },
  { name: 'fastify', type: 'backend', deps: ['fastify'] },
  { name: 'nestjs', type: 'backend', deps: ['@nestjs/core'] },
  { name: 'hono', type: 'backend', deps: ['hono'] },
  { name: 'koa', type: 'backend', deps: ['koa'] },
  { name: 'django', type: 'backend', files: ['manage.py'] },
  { name: 'flask', type: 'backend', deps: ['flask'] },
  { name: 'fastapi', type: 'backend', deps: ['fastapi'] },
  { name: 'rails', type: 'backend', files: ['Gemfile'], deps: ['rails'] },
  { name: 'spring', type: 'backend', deps: ['spring-boot-starter'] },
  // Libraries / CLI
  { name: 'electron', type: 'cli', deps: ['electron'] },
];

// ── Main class ───────────────────────────────────────────────────────────────

export class ProjectIndexer {
  private index: ProjectIndex | null = null;
  private readonly indexPath: string;

  constructor(private readonly projectRoot: string) {
    this.indexPath = join(projectRoot, '.ava', INDEX_FILENAME);
  }

  /** Full scan — builds index from scratch. */
  async scan(): Promise<ProjectIndex> {
    const allFiles: string[] = [];
    const structure = await this.buildStructure(this.projectRoot, 0, allFiles);

    const [framework, languages, entryPoints, testInfo, buildTools, packageManager, keyFiles] =
      await Promise.all([
        this.detectFramework(),
        this.detectLanguages(allFiles),
        this.detectEntryPoints(),
        this.detectTestInfo(),
        this.detectBuildTools(),
        this.detectPackageManager(),
        this.findKeyFiles(),
      ]);

    this.index = {
      version: 1,
      scannedAt: new Date().toISOString(),
      root: this.projectRoot,
      framework,
      languages,
      entryPoints,
      structure,
      testInfo,
      buildTools,
      packageManager,
      keyFiles,
    };

    await this.save();
    return this.index;
  }

  /** Load cached index from disk. Returns null if not found. */
  async load(): Promise<ProjectIndex | null> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      this.index = JSON.parse(raw) as ProjectIndex;
      return this.index;
    } catch {
      return null;
    }
  }

  /** Get current index (from memory or disk). */
  getIndex(): ProjectIndex | null {
    return this.index;
  }

  /** Check if the cached index is stale (>1 hour old). */
  isStale(): boolean {
    if (!this.index) return true;
    const age = Date.now() - new Date(this.index.scannedAt).getTime();
    return age > STALE_MS;
  }

  /** Generate a compressed summary string for system prompt injection. */
  summarize(): string {
    if (!this.index) return '(No project index — run project_index scan)';

    const idx = this.index;
    const lines: string[] = [];

    // Header
    const projectName = basename(idx.root);
    const frameworkLabel = idx.framework.name
      ? `${idx.framework.name} (${idx.framework.type})`
      : idx.framework.type;
    lines.push(`Project: ${projectName}`);
    lines.push(`Root: ${idx.root}`);
    lines.push(`Framework: ${frameworkLabel}`);

    // Languages
    const langSummary = idx.languages
      .slice(0, 5)
      .map(l => `${l.language} (${l.files} files)`)
      .join(', ');
    lines.push(`Languages: ${langSummary}`);

    // Package manager & build
    if (idx.packageManager) lines.push(`Package manager: ${idx.packageManager}`);
    if (idx.buildTools.length) lines.push(`Build: ${idx.buildTools.join(', ')}`);

    // Tests
    if (idx.testInfo.framework) {
      const testLoc = idx.testInfo.configFile || idx.testInfo.testDirs.join(', ');
      lines.push(`Tests: ${idx.testInfo.framework} (${testLoc})`);
    }

    // Structure (compact tree)
    lines.push('');
    lines.push('Structure:');
    this.formatTree(idx.structure, lines, '  ', 0, 3);

    // Entry points
    if (idx.entryPoints.length) {
      lines.push('');
      lines.push(`Entry points: ${idx.entryPoints.join(', ')}`);
    }

    // Key files
    if (idx.keyFiles.length) {
      lines.push(`Key files: ${idx.keyFiles.join(', ')}`);
    }

    return lines.join('\n');
  }

  // ── Private: save ──────────────────────────────────────────────────────────

  private async save(): Promise<void> {
    const dir = join(this.projectRoot, '.ava');
    await mkdir(dir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  // ── Private: structure builder ─────────────────────────────────────────────

  private async buildStructure(
    dir: string,
    depth: number,
    allFiles: string[],
  ): Promise<DirectoryNode> {
    const name = depth === 0 ? basename(dir) : basename(dir);
    const node: DirectoryNode = { name, type: 'dir', children: [], fileCount: 0 };

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return node;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry) || IGNORE_FILES.has(entry)) continue;
      if (entry.startsWith('.') && entry !== '.github') continue;

      const fullPath = join(dir, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        if (depth < MAX_DEPTH) {
          const child = await this.buildStructure(fullPath, depth + 1, allFiles);
          node.children!.push(child);
          node.fileCount! += child.fileCount ?? 0;
        }
      } else if (info.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (!BINARY_EXTENSIONS.has(ext)) {
          allFiles.push(relative(this.projectRoot, fullPath));
        }
        node.fileCount! = (node.fileCount ?? 0) + 1;
      }
    }

    // Sort children: dirs first, then files
    node.children!.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return node;
  }

  // ── Private: detection helpers ─────────────────────────────────────────────

  private async detectFramework(): Promise<FrameworkInfo> {
    const fallback: FrameworkInfo = { name: null, version: null, type: 'unknown' };

    // Try package.json first
    const pkgJson = await this.readJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(join(this.projectRoot, 'package.json'));

    if (pkgJson) {
      const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
      for (const rule of FRAMEWORK_RULES) {
        if (rule.deps?.some(d => d in allDeps)) {
          const version = rule.deps.map(d => allDeps[d]).find(Boolean) ?? null;
          return { name: rule.name, version, type: rule.type };
        }
      }
    }

    // Check for non-JS frameworks by file markers
    if (await this.fileExists(join(this.projectRoot, 'Cargo.toml'))) {
      return { name: 'rust', version: null, type: 'library' };
    }
    if (await this.fileExists(join(this.projectRoot, 'go.mod'))) {
      return { name: 'go', version: null, type: 'backend' };
    }
    if (await this.fileExists(join(this.projectRoot, 'pyproject.toml')) ||
        await this.fileExists(join(this.projectRoot, 'setup.py'))) {
      // Check for Django/Flask/FastAPI in pyproject.toml
      const pyproj = await this.readTextSafe(join(this.projectRoot, 'pyproject.toml'));
      if (pyproj) {
        if (pyproj.includes('django')) return { name: 'django', version: null, type: 'backend' };
        if (pyproj.includes('flask')) return { name: 'flask', version: null, type: 'backend' };
        if (pyproj.includes('fastapi')) return { name: 'fastapi', version: null, type: 'backend' };
      }
      return { name: 'python', version: null, type: 'library' };
    }
    if (await this.fileExists(join(this.projectRoot, 'manage.py'))) {
      return { name: 'django', version: null, type: 'backend' };
    }

    // Check for monorepo markers
    if (await this.fileExists(join(this.projectRoot, 'pnpm-workspace.yaml')) ||
        await this.fileExists(join(this.projectRoot, 'lerna.json')) ||
        await this.fileExists(join(this.projectRoot, 'nx.json'))) {
      return { name: null, version: null, type: 'fullstack' };
    }

    // Fallback: check if package.json exists → Node project
    if (pkgJson) {
      // Check if it's a library (has main/exports) or CLI (has bin)
      const raw = pkgJson as Record<string, unknown>;
      if (raw.bin) return { name: null, version: null, type: 'cli' };
      if (raw.main || raw.exports) return { name: null, version: null, type: 'library' };
    }

    return fallback;
  }

  private detectLanguages(allFiles: string[]): LanguageStats[] {
    const counts = new Map<string, { files: number; extensions: Set<string> }>();

    for (const file of allFiles) {
      const ext = extname(file).toLowerCase();
      const lang = EXTENSION_TO_LANGUAGE[ext];
      if (!lang) continue;

      const entry = counts.get(lang) ?? { files: 0, extensions: new Set() };
      entry.files++;
      entry.extensions.add(ext);
      counts.set(lang, entry);
    }

    return [...counts.entries()]
      .map(([language, { files, extensions }]) => ({
        language,
        files,
        extensions: [...extensions],
      }))
      .sort((a, b) => b.files - a.files);
  }

  private async detectEntryPoints(): Promise<string[]> {
    const entries: string[] = [];

    // Check package.json main/bin
    const pkgJson = await this.readJson<{
      main?: string;
      bin?: string | Record<string, string>;
      exports?: unknown;
    }>(join(this.projectRoot, 'package.json'));

    if (pkgJson) {
      if (pkgJson.main) entries.push(pkgJson.main);
      if (typeof pkgJson.bin === 'string') entries.push(pkgJson.bin);
      else if (pkgJson.bin) entries.push(...Object.values(pkgJson.bin));
    }

    // Common entry point patterns
    const candidates = [
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
      'src/app.ts', 'src/app.js', 'index.ts', 'index.js',
      'app.py', 'main.py', 'manage.py',
      'main.go', 'cmd/main.go',
      'src/main.rs', 'src/lib.rs',
    ];

    for (const candidate of candidates) {
      if (await this.fileExists(join(this.projectRoot, candidate))) {
        if (!entries.includes(candidate)) entries.push(candidate);
      }
    }

    // Check for monorepo packages
    const pkgsDir = join(this.projectRoot, 'packages');
    if (await this.dirExists(pkgsDir)) {
      try {
        const pkgs = await readdir(pkgsDir);
        for (const pkg of pkgs.slice(0, 10)) {
          const pkgEntry = join('packages', pkg, 'src', 'index.ts');
          if (await this.fileExists(join(this.projectRoot, pkgEntry))) {
            entries.push(pkgEntry);
          }
        }
      } catch { /* ignore */ }
    }

    return entries;
  }

  private async detectTestInfo(): Promise<TestInfo> {
    const result: TestInfo = {
      framework: null,
      configFile: null,
      testDirs: [],
      testPattern: '',
    };

    // Vitest
    for (const name of ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts']) {
      if (await this.fileExists(join(this.projectRoot, name))) {
        result.framework = 'vitest';
        result.configFile = name;
        result.testPattern = '**/*.{test,spec}.{ts,tsx,js,jsx}';
        break;
      }
    }

    // Jest
    if (!result.framework) {
      for (const name of ['jest.config.ts', 'jest.config.js', 'jest.config.mjs']) {
        if (await this.fileExists(join(this.projectRoot, name))) {
          result.framework = 'jest';
          result.configFile = name;
          result.testPattern = '**/*.{test,spec}.{ts,tsx,js,jsx}';
          break;
        }
      }
      // Also check package.json for jest config
      if (!result.framework) {
        const pkg = await this.readJson<{ jest?: unknown }>(join(this.projectRoot, 'package.json'));
        if (pkg?.jest) {
          result.framework = 'jest';
          result.configFile = 'package.json (jest section)';
          result.testPattern = '**/*.{test,spec}.{ts,tsx,js,jsx}';
        }
      }
    }

    // Pytest
    if (!result.framework) {
      if (await this.fileExists(join(this.projectRoot, 'pytest.ini')) ||
          await this.fileExists(join(this.projectRoot, 'conftest.py'))) {
        result.framework = 'pytest';
        result.configFile = 'pytest.ini';
        result.testPattern = '**/test_*.py';
      } else {
        const pyproj = await this.readTextSafe(join(this.projectRoot, 'pyproject.toml'));
        if (pyproj?.includes('[tool.pytest')) {
          result.framework = 'pytest';
          result.configFile = 'pyproject.toml';
          result.testPattern = '**/test_*.py';
        }
      }
    }

    // Go test (auto-detected)
    if (!result.framework && await this.fileExists(join(this.projectRoot, 'go.mod'))) {
      result.framework = 'go test';
      result.testPattern = '**/*_test.go';
    }

    // Cargo test (auto-detected)
    if (!result.framework && await this.fileExists(join(this.projectRoot, 'Cargo.toml'))) {
      result.framework = 'cargo test';
      result.testPattern = 'src/**/*.rs (inline #[test])';
    }

    // Mocha
    if (!result.framework) {
      for (const name of ['.mocharc.yml', '.mocharc.yaml', '.mocharc.json', '.mocharc.js']) {
        if (await this.fileExists(join(this.projectRoot, name))) {
          result.framework = 'mocha';
          result.configFile = name;
          result.testPattern = '**/*.{test,spec}.{ts,js}';
          break;
        }
      }
    }

    // Detect test directories
    for (const dir of ['test', 'tests', '__tests__', 'spec', 'specs']) {
      if (await this.dirExists(join(this.projectRoot, dir))) {
        result.testDirs.push(dir);
      }
    }
    // Also check src for co-located tests
    if (result.framework && ['vitest', 'jest'].includes(result.framework)) {
      result.testDirs.push('src (co-located)');
    }

    return result;
  }

  private async detectBuildTools(): Promise<string[]> {
    const tools: string[] = [];

    const checks: [string, string][] = [
      ['tsconfig.json', 'tsc'],
      ['vite.config.ts', 'vite'], ['vite.config.js', 'vite'], ['vite.config.mts', 'vite'],
      ['webpack.config.js', 'webpack'], ['webpack.config.ts', 'webpack'],
      ['rollup.config.js', 'rollup'], ['rollup.config.ts', 'rollup'],
      ['esbuild.config.js', 'esbuild'],
      ['turbo.json', 'turborepo'],
      ['nx.json', 'nx'],
      ['Makefile', 'make'],
      ['CMakeLists.txt', 'cmake'],
      ['build.gradle', 'gradle'], ['build.gradle.kts', 'gradle'],
      ['pom.xml', 'maven'],
    ];

    for (const [file, tool] of checks) {
      if (await this.fileExists(join(this.projectRoot, file))) {
        if (!tools.includes(tool)) tools.push(tool);
      }
    }

    // Check package.json scripts for common build tools
    const pkg = await this.readJson<{ scripts?: Record<string, string>; devDependencies?: Record<string, string> }>(
      join(this.projectRoot, 'package.json'),
    );
    if (pkg?.devDependencies) {
      if ('esbuild' in pkg.devDependencies && !tools.includes('esbuild')) tools.push('esbuild');
      if ('swc' in pkg.devDependencies || '@swc/core' in pkg.devDependencies) tools.push('swc');
    }

    return tools;
  }

  private async detectPackageManager(): Promise<string | null> {
    if (await this.fileExists(join(this.projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await this.fileExists(join(this.projectRoot, 'bun.lockb'))) return 'bun';
    if (await this.fileExists(join(this.projectRoot, 'yarn.lock'))) return 'yarn';
    if (await this.fileExists(join(this.projectRoot, 'package-lock.json'))) return 'npm';

    // Check package.json packageManager field
    const pkg = await this.readJson<{ packageManager?: string }>(join(this.projectRoot, 'package.json'));
    if (pkg?.packageManager) {
      const match = pkg.packageManager.match(/^(pnpm|yarn|npm|bun)/);
      if (match) return match[1];
    }

    return null;
  }

  private async findKeyFiles(): Promise<string[]> {
    const found: string[] = [];

    // Simple file checks (no glob — fast)
    const simpleFiles = [
      'tsconfig.json', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs',
      '.prettierrc', '.prettierrc.json', 'prettier.config.js',
      'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
      '.env.example', '.env.template',
      'Makefile', 'CMakeLists.txt',
      'pyproject.toml', 'requirements.txt',
      'Cargo.toml', 'go.mod',
      'pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json',
    ];

    for (const file of simpleFiles) {
      if (await this.fileExists(join(this.projectRoot, file))) {
        found.push(file);
      }
    }

    // Check .github/workflows
    const workflowDir = join(this.projectRoot, '.github', 'workflows');
    try {
      const workflows = await readdir(workflowDir);
      for (const wf of workflows) {
        if (wf.endsWith('.yml') || wf.endsWith('.yaml')) {
          found.push(`.github/workflows/${wf}`);
        }
      }
    } catch { /* no workflows */ }

    return found;
  }

  // ── Private: formatting ────────────────────────────────────────────────────

  private formatTree(
    node: DirectoryNode,
    lines: string[],
    indent: string,
    depth: number,
    maxDepth: number,
  ): void {
    if (depth > maxDepth) return;

    if (node.type === 'dir' && node.children?.length) {
      const countLabel = node.fileCount ? ` (${node.fileCount} files)` : '';
      lines.push(`${indent}${node.name}/${countLabel}`);
      for (const child of node.children) {
        if (child.type === 'dir') {
          this.formatTree(child, lines, indent + '  ', depth + 1, maxDepth);
        }
      }
    }
  }

  // ── Private: utilities ─────────────────────────────────────────────────────

  private async readJson<T>(path: string): Promise<T | null> {
    try {
      const raw = await readFile(path, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async readTextSafe(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      return null;
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      const s = await stat(path);
      return s.isFile();
    } catch {
      return false;
    }
  }

  private async dirExists(path: string): Promise<boolean> {
    try {
      const s = await stat(path);
      return s.isDirectory();
    } catch {
      return false;
    }
  }
}
