import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SymbolIndex {
  version: 1;
  scannedAt: string;
  symbols: SymbolEntry[];
}

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  file: string;       // relative to project root
  line: number;        // 1-based
  exported: boolean;
  language: string;
}

export type SymbolKind =
  | 'function' | 'class' | 'interface' | 'type' | 'enum'
  | 'const' | 'variable' | 'struct' | 'trait' | 'method';

export interface SymbolReference {
  file: string;
  line: number;
  context: string;     // the matching line
}

// ── Constants ────────────────────────────────────────────────────────────────

const INDEX_FILENAME = 'symbols.json';
const MAX_FILE_SIZE = 100 * 1024; // 100 KB — skip larger files
const BATCH_SIZE = 50;

const SOURCE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.dart': 'dart',
  '.scala': 'scala',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
  '.next', '.nuxt', '.svelte-kit', 'coverage', '.cache', '.turbo',
  '.parcel-cache', '.venv', 'venv', 'target', '.ava',
]);

// ── Main class ───────────────────────────────────────────────────────────────

export class SymbolIndexer {
  private index: SymbolIndex | null = null;
  private readonly indexPath: string;

  constructor(private readonly projectRoot: string) {
    this.indexPath = join(projectRoot, '.ava', INDEX_FILENAME);
  }

  /** Full scan — extract symbols from all source files. */
  async scan(files?: string[]): Promise<SymbolIndex> {
    const sourceFiles = files ?? await this.collectSourceFiles();

    const allSymbols: SymbolEntry[] = [];

    // Process in batches for memory efficiency
    for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
      const batch = sourceFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(file => this.extractSymbolsFromFile(file)),
      );
      for (const symbols of results) {
        allSymbols.push(...symbols);
      }
    }

    this.index = {
      version: 1,
      scannedAt: new Date().toISOString(),
      symbols: allSymbols,
    };

    await this.save();
    return this.index;
  }

  /** Load cached index from disk. */
  async load(): Promise<SymbolIndex | null> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      this.index = JSON.parse(raw) as SymbolIndex;
      return this.index;
    } catch {
      return null;
    }
  }

  /** Get the full index. */
  getIndex(): SymbolIndex | null {
    return this.index;
  }

  /** Find symbols by name (case-insensitive substring match). */
  findByName(query: string): SymbolEntry[] {
    if (!this.index) return [];
    const lower = query.toLowerCase();
    return this.index.symbols
      .filter(s => s.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        // Exact match first, then exported first, then alphabetical
        const aExact = a.name.toLowerCase() === lower ? 0 : 1;
        const bExact = b.name.toLowerCase() === lower ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        if (a.exported !== b.exported) return a.exported ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  /** Find all symbols defined in a specific file. */
  findInFile(filePath: string): SymbolEntry[] {
    if (!this.index) return [];
    const normalized = this.normalizePath(filePath);
    return this.index.symbols.filter(s => s.file === normalized);
  }

  /** Find where a symbol name appears across indexed source files. */
  async findReferences(symbolName: string): Promise<SymbolReference[]> {
    if (!this.index) return [];

    // Get unique files from index
    const files = [...new Set(this.index.symbols.map(s => s.file))];
    const refs: SymbolReference[] = [];

    // Search in batches
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(file => this.searchFileForSymbol(file, symbolName)),
      );
      for (const fileRefs of results) {
        refs.push(...fileRefs);
      }
    }

    // Sort by file, then line
    refs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

    // Limit results
    return refs.slice(0, 100);
  }

  /** Get a quick stats summary. */
  summarize(): string {
    if (!this.index) return 'No symbol index available.';

    const total = this.index.symbols.length;
    const exported = this.index.symbols.filter(s => s.exported).length;
    const byKind = new Map<string, number>();
    for (const s of this.index.symbols) {
      byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
    }

    const kindSummary = [...byKind.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => `${count} ${kind}s`)
      .join(', ');

    return `${total} symbols indexed (${exported} exported): ${kindSummary}`;
  }

  // ── Private: save ──────────────────────────────────────────────────────────

  private async save(): Promise<void> {
    const dir = join(this.projectRoot, '.ava');
    await mkdir(dir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  // ── Private: file collection ───────────────────────────────────────────────

  private async collectSourceFiles(dir?: string): Promise<string[]> {
    const root = dir ?? this.projectRoot;
    const files: string[] = [];

    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      return files;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry)) continue;
      if (entry.startsWith('.') && entry !== '.github') continue;

      const fullPath = join(root, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        const subFiles = await this.collectSourceFiles(fullPath);
        files.push(...subFiles);
      } else if (info.isFile() && info.size <= MAX_FILE_SIZE) {
        const ext = extname(entry).toLowerCase();
        if (ext in SOURCE_EXTENSIONS) {
          files.push(relative(this.projectRoot, fullPath));
        }
      }
    }

    return files;
  }

  // ── Private: extraction ────────────────────────────────────────────────────

  private async extractSymbolsFromFile(relPath: string): Promise<SymbolEntry[]> {
    const fullPath = join(this.projectRoot, relPath);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      return [];
    }

    const ext = extname(relPath).toLowerCase();
    const language = SOURCE_EXTENSIONS[ext];
    if (!language) return [];

    switch (language) {
      case 'typescript':
      case 'javascript':
      case 'vue':
      case 'svelte':
        return this.extractTypeScript(content, relPath, language);
      case 'python':
        return this.extractPython(content, relPath);
      case 'go':
        return this.extractGo(content, relPath);
      case 'rust':
        return this.extractRust(content, relPath);
      case 'java':
      case 'kotlin':
      case 'scala':
        return this.extractJavaLike(content, relPath, language);
      case 'csharp':
        return this.extractCSharp(content, relPath);
      case 'ruby':
        return this.extractRuby(content, relPath);
      case 'php':
        return this.extractPHP(content, relPath);
      case 'swift':
        return this.extractSwift(content, relPath);
      case 'dart':
        return this.extractDart(content, relPath);
      default:
        return [];
    }
  }

  // ── Language extractors (regex-based) ──────────────────────────────────────

  private extractTypeScript(content: string, file: string, language: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || !trimmed) continue;

      const isExported = trimmed.startsWith('export ');
      const src = isExported ? trimmed.replace(/^export\s+(default\s+)?/, '') : trimmed;

      // function name(
      const funcMatch = src.match(/^(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], kind: 'function', file, line: i + 1, exported: isExported, language });
        continue;
      }

      // class Name
      const classMatch = src.match(/^(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', file, line: i + 1, exported: isExported, language });
        continue;
      }

      // interface Name
      const ifaceMatch = src.match(/^interface\s+(\w+)/);
      if (ifaceMatch) {
        symbols.push({ name: ifaceMatch[1], kind: 'interface', file, line: i + 1, exported: isExported, language });
        continue;
      }

      // type Name =
      const typeMatch = src.match(/^type\s+(\w+)\s*[=<]/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], kind: 'type', file, line: i + 1, exported: isExported, language });
        continue;
      }

      // enum Name
      const enumMatch = src.match(/^(?:const\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], kind: 'enum', file, line: i + 1, exported: isExported, language });
        continue;
      }

      // const Name = | let Name = | var Name =
      const varMatch = src.match(/^(?:const|let|var)\s+(\w+)\s*[=:]/);
      if (varMatch) {
        const kind = src.startsWith('const') ? 'const' : 'variable';
        symbols.push({ name: varMatch[1], kind, file, line: i + 1, exported: isExported, language });
        continue;
      }

      // Arrow function: const Name = (...) =>  or const Name = async (...) =>
      // (already caught by const match above — just refine kind)
    }

    return symbols;
  }

  private extractPython(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed) continue;

      // class Name
      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        // Python doesn't have export keyword — top-level = "exported", _prefixed = private
        const exported = !classMatch[1].startsWith('_');
        symbols.push({ name: classMatch[1], kind: 'class', file, line: i + 1, exported, language: 'python' });
        continue;
      }

      // def name( or async def name(
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
      if (funcMatch) {
        // Only top-level (no indentation) counts as module-level symbol
        const isTopLevel = !line.match(/^\s/);
        if (isTopLevel) {
          const exported = !funcMatch[1].startsWith('_');
          symbols.push({ name: funcMatch[1], kind: 'function', file, line: i + 1, exported, language: 'python' });
        }
        continue;
      }

      // Top-level constant assignment: NAME = ... (UPPER_CASE convention)
      if (!line.match(/^\s/)) {
        const constMatch = trimmed.match(/^([A-Z][A-Z0-9_]+)\s*=/);
        if (constMatch) {
          symbols.push({ name: constMatch[1], kind: 'const', file, line: i + 1, exported: true, language: 'python' });
        }
      }
    }

    return symbols;
  }

  private extractGo(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || !trimmed) continue;

      // func Name( or func (receiver) Name(
      const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/);
      if (funcMatch) {
        const exported = funcMatch[1][0] === funcMatch[1][0].toUpperCase() && /[A-Z]/.test(funcMatch[1][0]);
        symbols.push({ name: funcMatch[1], kind: 'function', file, line: i + 1, exported, language: 'go' });
        continue;
      }

      // type Name struct/interface
      const typeMatch = trimmed.match(/^type\s+(\w+)\s+(struct|interface)/);
      if (typeMatch) {
        const exported = /^[A-Z]/.test(typeMatch[1]);
        const kind = typeMatch[2] === 'struct' ? 'struct' : 'interface';
        symbols.push({ name: typeMatch[1], kind, file, line: i + 1, exported, language: 'go' });
        continue;
      }

      // type Name = ... (type alias)
      const aliasMatch = trimmed.match(/^type\s+(\w+)\s+\w/);
      if (aliasMatch && !typeMatch) {
        const exported = /^[A-Z]/.test(aliasMatch[1]);
        symbols.push({ name: aliasMatch[1], kind: 'type', file, line: i + 1, exported, language: 'go' });
        continue;
      }

      // var/const Name
      const varMatch = trimmed.match(/^(?:var|const)\s+(\w+)/);
      if (varMatch) {
        const exported = /^[A-Z]/.test(varMatch[1]);
        symbols.push({ name: varMatch[1], kind: 'const', file, line: i + 1, exported, language: 'go' });
      }
    }

    return symbols;
  }

  private extractRust(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || !trimmed) continue;

      const isPub = trimmed.startsWith('pub ');
      const src = isPub ? trimmed.replace(/^pub\s+(\(crate\)\s+)?/, '') : trimmed;

      // fn name(
      const fnMatch = src.match(/^(?:async\s+)?fn\s+(\w+)/);
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', file, line: i + 1, exported: isPub, language: 'rust' });
        continue;
      }

      // struct Name
      const structMatch = src.match(/^struct\s+(\w+)/);
      if (structMatch) {
        symbols.push({ name: structMatch[1], kind: 'struct', file, line: i + 1, exported: isPub, language: 'rust' });
        continue;
      }

      // enum Name
      const enumMatch = src.match(/^enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], kind: 'enum', file, line: i + 1, exported: isPub, language: 'rust' });
        continue;
      }

      // trait Name
      const traitMatch = src.match(/^trait\s+(\w+)/);
      if (traitMatch) {
        symbols.push({ name: traitMatch[1], kind: 'trait', file, line: i + 1, exported: isPub, language: 'rust' });
        continue;
      }

      // type Name =
      const typeMatch = src.match(/^type\s+(\w+)/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], kind: 'type', file, line: i + 1, exported: isPub, language: 'rust' });
        continue;
      }

      // const NAME: or static NAME:
      const constMatch = src.match(/^(?:const|static)\s+(\w+)\s*:/);
      if (constMatch) {
        symbols.push({ name: constMatch[1], kind: 'const', file, line: i + 1, exported: isPub, language: 'rust' });
      }
    }

    return symbols;
  }

  private extractJavaLike(content: string, file: string, language: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || !trimmed) continue;

      // class/interface/enum
      const classMatch = trimmed.match(
        /(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:final\s+)?(class|interface|enum)\s+(\w+)/,
      );
      if (classMatch) {
        const exported = !trimmed.includes('private');
        const kind = classMatch[1] as 'class' | 'interface' | 'enum';
        symbols.push({ name: classMatch[2], kind, file, line: i + 1, exported, language });
        continue;
      }

      // Method (simplified): access modifier + return type + name(
      const methodMatch = trimmed.match(
        /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:synchronized\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/,
      );
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'new'].includes(methodMatch[1])) {
        const exported = !trimmed.includes('private');
        symbols.push({ name: methodMatch[1], kind: 'method', file, line: i + 1, exported, language });
      }
    }

    return symbols;
  }

  private extractCSharp(content: string, file: string): SymbolEntry[] {
    // C# is similar to Java — reuse with language tag
    return this.extractJavaLike(content, file, 'csharp');
  }

  private extractRuby(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('#') || !trimmed) continue;

      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', file, line: i + 1, exported: true, language: 'ruby' });
        continue;
      }

      const moduleMatch = trimmed.match(/^module\s+(\w+)/);
      if (moduleMatch) {
        symbols.push({ name: moduleMatch[1], kind: 'class', file, line: i + 1, exported: true, language: 'ruby' });
        continue;
      }

      const defMatch = trimmed.match(/^def\s+(self\.)?(\w+)/);
      if (defMatch) {
        symbols.push({ name: defMatch[2], kind: 'function', file, line: i + 1, exported: !defMatch[2].startsWith('_'), language: 'ruby' });
      }
    }

    return symbols;
  }

  private extractPHP(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || !trimmed) continue;

      const classMatch = trimmed.match(/(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', file, line: i + 1, exported: true, language: 'php' });
        continue;
      }

      const ifaceMatch = trimmed.match(/interface\s+(\w+)/);
      if (ifaceMatch) {
        symbols.push({ name: ifaceMatch[1], kind: 'interface', file, line: i + 1, exported: true, language: 'php' });
        continue;
      }

      const funcMatch = trimmed.match(/^(?:public|private|protected|static|\s)*function\s+(\w+)/);
      if (funcMatch) {
        const exported = !trimmed.includes('private');
        symbols.push({ name: funcMatch[1], kind: 'function', file, line: i + 1, exported, language: 'php' });
      }
    }

    return symbols;
  }

  private extractSwift(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || !trimmed) continue;

      const isPub = trimmed.startsWith('public ') || trimmed.startsWith('open ');
      const src = trimmed.replace(/^(?:public|private|internal|open|fileprivate)\s+/, '');

      const classMatch = src.match(/^(?:final\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', file, line: i + 1, exported: isPub, language: 'swift' });
        continue;
      }

      const structMatch = src.match(/^struct\s+(\w+)/);
      if (structMatch) {
        symbols.push({ name: structMatch[1], kind: 'struct', file, line: i + 1, exported: isPub, language: 'swift' });
        continue;
      }

      const enumMatch = src.match(/^enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], kind: 'enum', file, line: i + 1, exported: isPub, language: 'swift' });
        continue;
      }

      const funcMatch = src.match(/^func\s+(\w+)/);
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], kind: 'function', file, line: i + 1, exported: isPub, language: 'swift' });
        continue;
      }

      const protocolMatch = src.match(/^protocol\s+(\w+)/);
      if (protocolMatch) {
        symbols.push({ name: protocolMatch[1], kind: 'interface', file, line: i + 1, exported: isPub, language: 'swift' });
      }
    }

    return symbols;
  }

  private extractDart(content: string, file: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || !trimmed) continue;

      // Dart: _prefix means private, no prefix means public
      const classMatch = trimmed.match(/^(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', file, line: i + 1, exported: !classMatch[1].startsWith('_'), language: 'dart' });
        continue;
      }

      const enumMatch = trimmed.match(/^enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], kind: 'enum', file, line: i + 1, exported: !enumMatch[1].startsWith('_'), language: 'dart' });
        continue;
      }

      // Top-level functions (no indentation)
      if (!lines[i].match(/^\s/)) {
        const funcMatch = trimmed.match(/^(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*(?:async\s*)?[{=]/);
        if (funcMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(funcMatch[1])) {
          symbols.push({ name: funcMatch[1], kind: 'function', file, line: i + 1, exported: !funcMatch[1].startsWith('_'), language: 'dart' });
        }
      }
    }

    return symbols;
  }

  // ── Private: reference search ──────────────────────────────────────────────

  private async searchFileForSymbol(relPath: string, symbolName: string): Promise<SymbolReference[]> {
    const fullPath = join(this.projectRoot, relPath);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      return [];
    }

    const refs: SymbolReference[] = [];
    const lines = content.split('\n');
    // Build a word-boundary pattern for the symbol
    const pattern = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`);

    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        refs.push({
          file: relPath,
          line: i + 1,
          context: lines[i].trim(),
        });
      }
    }

    return refs;
  }

  // ── Private: utilities ─────────────────────────────────────────────────────

  private normalizePath(filePath: string): string {
    // If absolute, make relative to project root
    if (filePath.startsWith(this.projectRoot)) {
      return relative(this.projectRoot, filePath);
    }
    // Replace backslashes (Windows)
    return filePath.replace(/\\/g, '/');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
