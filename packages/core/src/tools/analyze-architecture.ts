import { readFile } from 'node:fs/promises';
import { join, relative, extname, dirname } from 'node:path';
import { glob } from 'glob';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const MAX_FILES = 500;

interface FileInfo {
  path: string;
  lines: number;
  imports: string[];
  exports: string[];
}

interface CircularDep {
  cycle: string[];
}

interface ArchReport {
  totalFiles: number;
  totalLines: number;
  filesByExtension: Record<string, number>;
  largeFiles: { path: string; lines: number }[];
  circularDeps: CircularDep[];
  orphanFiles: string[];
  deepestNesting: { path: string; depth: number }[];
  avgFileSize: number;
  couplingHotspots: { path: string; importedBy: number }[];
}

export class AnalyzeArchitectureTool implements Tool {
  readonly name = 'analyze_architecture';
  readonly description = 'Analyze project architecture — dependency graph, circular imports, coupling hotspots, file metrics';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'analyze_architecture',
    description:
      'Scan the project and analyze its architecture. Detects circular dependencies, ' +
      'coupling hotspots (files imported by many others), large files, deeply nested directories, ' +
      'and orphan files (not imported by anything). Returns a structured report with metrics and recommendations.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to analyze. Default: project root.',
        },
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['circular', 'coupling', 'size', 'nesting', 'orphans', 'all'],
          },
          description: 'Which checks to run. Default: ["all"].',
        },
        threshold_lines: {
          type: 'number',
          description: 'Line count threshold for "large file" warnings. Default: 300.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const scanPath = (args.path as string) ?? context.cwd;
    const checks = new Set((args.checks as string[]) ?? ['all']);
    const runAll = checks.has('all');
    const thresholdLines = (args.threshold_lines as number) ?? 300;

    // Find all source files
    const files = await glob('**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,vue,svelte}', {
      cwd: scanPath,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/target/**', '**/__pycache__/**', '**/venv/**', '**/.git/**'],
    });

    if (files.length === 0) {
      return { success: false, output: 'No source files found in the project.' };
    }

    if (files.length > MAX_FILES) {
      return { success: false, output: `Too many files (${files.length}). Narrow the scan with the "path" parameter.` };
    }

    // Parse all files
    const fileInfos = await Promise.all(files.map(f => this.parseFile(f, scanPath)));
    const report: ArchReport = {
      totalFiles: fileInfos.length,
      totalLines: fileInfos.reduce((sum, f) => sum + f.lines, 0),
      filesByExtension: {},
      largeFiles: [],
      circularDeps: [],
      orphanFiles: [],
      deepestNesting: [],
      avgFileSize: 0,
      couplingHotspots: [],
    };

    report.avgFileSize = Math.round(report.totalLines / report.totalFiles);

    // Files by extension
    for (const f of fileInfos) {
      const ext = extname(f.path);
      report.filesByExtension[ext] = (report.filesByExtension[ext] || 0) + 1;
    }

    // Large files
    if (runAll || checks.has('size')) {
      report.largeFiles = fileInfos
        .filter(f => f.lines > thresholdLines)
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 20)
        .map(f => ({ path: f.path, lines: f.lines }));
    }

    // Deep nesting
    if (runAll || checks.has('nesting')) {
      report.deepestNesting = fileInfos
        .map(f => ({ path: f.path, depth: f.path.split('/').length }))
        .sort((a, b) => b.depth - a.depth)
        .slice(0, 10);
    }

    // Build dependency graph for circular + coupling + orphan checks
    if (runAll || checks.has('circular') || checks.has('coupling') || checks.has('orphans')) {
      const graph = this.buildGraph(fileInfos);

      // Circular dependencies
      if (runAll || checks.has('circular')) {
        report.circularDeps = this.findCircularDeps(graph).slice(0, 10);
      }

      // Coupling hotspots
      if (runAll || checks.has('coupling')) {
        const importCounts = new Map<string, number>();
        for (const [, deps] of graph) {
          for (const dep of deps) {
            importCounts.set(dep, (importCounts.get(dep) || 0) + 1);
          }
        }
        report.couplingHotspots = [...importCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([path, count]) => ({ path, importedBy: count }));
      }

      // Orphan files
      if (runAll || checks.has('orphans')) {
        const imported = new Set<string>();
        for (const [, deps] of graph) {
          for (const dep of deps) imported.add(dep);
        }
        report.orphanFiles = fileInfos
          .map(f => f.path)
          .filter(p => !imported.has(p) && !p.includes('index.') && !p.includes('main.') && !p.includes('app.'))
          .slice(0, 20);
      }
    }

    // Format output
    return {
      success: true,
      output: this.formatReport(report, thresholdLines),
      metadata: {
        totalFiles: report.totalFiles,
        totalLines: report.totalLines,
        circularDeps: report.circularDeps.length,
        largeFiles: report.largeFiles.length,
        orphanFiles: report.orphanFiles.length,
      },
    };
  }

  private async parseFile(filePath: string, root: string): Promise<FileInfo> {
    const rel = relative(root, filePath).replace(/\\/g, '/');
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      const imports = this.extractImports(content, filePath);
      const exports = this.extractExports(content, filePath);
      return { path: rel, lines, imports, exports };
    } catch {
      return { path: rel, lines: 0, imports: [], exports: [] };
    }
  }

  private extractImports(content: string, filePath: string): string[] {
    const ext = extname(filePath);
    const imports: string[] = [];

    if (['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'].includes(ext)) {
      // ES imports
      const esRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = esRegex.exec(content)) !== null) {
        if (match[1].startsWith('.')) imports.push(match[1]);
      }
      // require()
      const reqRegex = /require\(['"]([^'"]+)['"]\)/g;
      while ((match = reqRegex.exec(content)) !== null) {
        if (match[1].startsWith('.')) imports.push(match[1]);
      }
    } else if (ext === '.py') {
      const pyRegex = /^(?:from|import)\s+([\w.]+)/gm;
      let match;
      while ((match = pyRegex.exec(content)) !== null) {
        if (!match[1].startsWith('__')) imports.push(match[1]);
      }
    } else if (ext === '.go') {
      const goRegex = /"([^"]+)"/g;
      let match;
      while ((match = goRegex.exec(content)) !== null) {
        if (!match[1].includes('.')) imports.push(match[1]); // Local packages only
      }
    }

    return imports;
  }

  private extractExports(content: string, filePath: string): string[] {
    const ext = extname(filePath);
    const exports: string[] = [];

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const exportRegex = /export\s+(?:default\s+)?(?:function|const|class|type|interface|enum|async\s+function)\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return exports;
  }

  private buildGraph(files: FileInfo[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const allPaths = new Set(files.map(f => f.path));

    for (const file of files) {
      const resolved: string[] = [];
      for (const imp of file.imports) {
        // Try to resolve relative import to a known file
        const dir = dirname(file.path);
        const candidates = [
          join(dir, imp).replace(/\\/g, '/'),
          join(dir, imp + '.ts').replace(/\\/g, '/'),
          join(dir, imp + '.tsx').replace(/\\/g, '/'),
          join(dir, imp + '.js').replace(/\\/g, '/'),
          join(dir, imp + '/index.ts').replace(/\\/g, '/'),
          join(dir, imp + '/index.js').replace(/\\/g, '/'),
        ];
        for (const c of candidates) {
          if (allPaths.has(c)) {
            resolved.push(c);
            break;
          }
        }
      }
      graph.set(file.path, resolved);
    }

    return graph;
  }

  private findCircularDeps(graph: Map<string, string[]>): CircularDep[] {
    const cycles: CircularDep[] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (stack.has(node)) {
        // Found cycle
        const cycleStart = path.indexOf(node);
        if (cycleStart >= 0) {
          cycles.push({ cycle: [...path.slice(cycleStart), node] });
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const dep of graph.get(node) || []) {
        if (cycles.length >= 10) return; // Cap at 10 cycles
        dfs(dep);
      }

      path.pop();
      stack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) dfs(node);
      if (cycles.length >= 10) break;
    }

    return cycles;
  }

  private formatReport(report: ArchReport, threshold: number): string {
    let out = '# Architecture Analysis\n\n';

    // Overview
    out += `## Overview\n`;
    out += `- **Files:** ${report.totalFiles}\n`;
    out += `- **Total lines:** ${report.totalLines.toLocaleString()}\n`;
    out += `- **Average file size:** ${report.avgFileSize} lines\n`;
    out += `- **Extensions:** ${Object.entries(report.filesByExtension).map(([k, v]) => `${k} (${v})`).join(', ')}\n\n`;

    // Circular deps
    if (report.circularDeps.length > 0) {
      out += `## Circular Dependencies (${report.circularDeps.length})\n`;
      for (const cd of report.circularDeps) {
        out += `- ${cd.cycle.join(' → ')}\n`;
      }
      out += '\n';
    } else {
      out += `## Circular Dependencies\nNone found.\n\n`;
    }

    // Coupling hotspots
    if (report.couplingHotspots.length > 0) {
      out += `## Coupling Hotspots (most imported files)\n`;
      for (const h of report.couplingHotspots) {
        out += `- **${h.path}** — imported by ${h.importedBy} files\n`;
      }
      out += '\n';
    }

    // Large files
    if (report.largeFiles.length > 0) {
      out += `## Large Files (>${threshold} lines)\n`;
      for (const f of report.largeFiles) {
        out += `- **${f.path}** — ${f.lines} lines\n`;
      }
      out += '\n';
    } else {
      out += `## Large Files\nAll files under ${threshold} lines.\n\n`;
    }

    // Orphan files
    if (report.orphanFiles.length > 0) {
      out += `## Potential Orphan Files (not imported by anything)\n`;
      for (const f of report.orphanFiles) {
        out += `- ${f}\n`;
      }
      out += '\n';
    }

    // Deepest nesting
    if (report.deepestNesting.length > 0) {
      out += `## Deepest Nesting\n`;
      for (const f of report.deepestNesting.slice(0, 5)) {
        out += `- ${f.path} (depth: ${f.depth})\n`;
      }
      out += '\n';
    }

    return out;
  }
}
