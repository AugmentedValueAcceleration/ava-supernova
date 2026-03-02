import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { SymbolIndexer, SymbolEntry } from '../indexer/symbol-indexer.js';

const ALLOWED_ACTIONS = new Set(['definition', 'references', 'file']);

export class FindSymbolTool implements Tool {
  readonly name = 'find_symbol';
  readonly description = 'Find where functions, classes, types, and other symbols are defined or referenced';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'find_symbol',
    description:
      'Find where functions, classes, types, and other symbols are ' +
      'defined or referenced in the codebase. Uses the symbol index for fast lookups. ' +
      'Much faster than grep for finding definitions — use this first, fall back to grep ' +
      'for complex patterns.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Symbol name to search for (case-insensitive substring match). ' +
            'For "file" action, provide the relative file path instead.',
        },
        action: {
          type: 'string',
          enum: ['definition', 'references', 'file'],
          description:
            '"definition" (default) finds where the symbol is defined — returns file:line. ' +
            '"references" finds files that use/import the symbol. ' +
            '"file" lists all symbols defined in a specific file (use query as file path).',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = args.query as string;
    const action = (args.action as string) ?? 'definition';

    if (!query?.trim()) {
      return { success: false, output: 'Query is required.' };
    }

    if (!ALLOWED_ACTIONS.has(action)) {
      return {
        success: false,
        output: `Invalid action "${action}". Use one of: ${[...ALLOWED_ACTIONS].join(', ')}`,
      };
    }

    const indexer = context.sharedState?.symbolIndexer as SymbolIndexer | undefined;
    if (!indexer) {
      return { success: false, output: 'Symbol indexer is not available in this context.' };
    }

    // Auto-scan if no index exists
    if (!indexer.getIndex()) {
      const loaded = await indexer.load();
      if (!loaded) {
        await indexer.scan();
      }
    }

    try {
      switch (action) {
        case 'definition': {
          const matches = indexer.findByName(query);
          if (matches.length === 0) {
            return {
              success: true,
              output: `No symbols found matching "${query}". Try a different search term or use grep for non-standard patterns.`,
            };
          }
          const output = this.formatDefinitions(matches, query);
          return {
            success: true,
            output,
            metadata: { count: matches.length },
          };
        }

        case 'references': {
          const refs = await indexer.findReferences(query);
          if (refs.length === 0) {
            return {
              success: true,
              output: `No references found for "${query}".`,
            };
          }
          const lines = refs.map(r => `  ${r.file}:${r.line}  ${r.context}`);
          const truncated = refs.length >= 100 ? '\n\n(Results truncated at 100. Use grep for more.)' : '';
          return {
            success: true,
            output: `Found ${refs.length} references to "${query}":\n\n${lines.join('\n')}${truncated}`,
            metadata: { count: refs.length },
          };
        }

        case 'file': {
          const symbols = indexer.findInFile(query);
          if (symbols.length === 0) {
            return {
              success: true,
              output: `No symbols found in "${query}". The file may not be indexed (check file extension) or may not exist.`,
            };
          }
          const output = this.formatFileSymbols(symbols, query);
          return {
            success: true,
            output,
            metadata: { count: symbols.length },
          };
        }

        default:
          return { success: false, output: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Symbol search failed: ${message}` };
    }
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────

  private formatDefinitions(symbols: SymbolEntry[], query: string): string {
    const lines: string[] = [`Found ${symbols.length} symbol(s) matching "${query}":\n`];

    for (const s of symbols.slice(0, 50)) {
      const exportTag = s.exported ? ' [exported]' : '';
      lines.push(`  ${s.kind} ${s.name}${exportTag}`);
      lines.push(`    → ${s.file}:${s.line} (${s.language})`);
    }

    if (symbols.length > 50) {
      lines.push(`\n  ... and ${symbols.length - 50} more matches.`);
    }

    return lines.join('\n');
  }

  private formatFileSymbols(symbols: SymbolEntry[], filePath: string): string {
    const lines: string[] = [`Symbols in ${filePath} (${symbols.length} total):\n`];

    // Group by kind
    const byKind = new Map<string, SymbolEntry[]>();
    for (const s of symbols) {
      const group = byKind.get(s.kind) ?? [];
      group.push(s);
      byKind.set(s.kind, group);
    }

    for (const [kind, entries] of byKind) {
      lines.push(`  ${kind}s:`);
      for (const s of entries) {
        const exportTag = s.exported ? ' [exported]' : '';
        lines.push(`    ${s.name}${exportTag} (line ${s.line})`);
      }
    }

    return lines.join('\n');
  }
}
