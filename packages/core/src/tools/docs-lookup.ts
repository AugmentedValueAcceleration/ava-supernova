import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { AVA_DOCS, type DocSection } from '../docs/ava-docs.js';

export class DocsLookupTool implements Tool {
  readonly name = 'docs_lookup';
  readonly description = 'Search Ava\'s documentation to help users with features, setup, and troubleshooting';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'docs_lookup',
    description:
      'Search Ava\'s own documentation to answer user questions about features, setup, configuration, ' +
      'troubleshooting, models, tools, modes, permissions, memory, keyboard shortcuts, billing, and more. ' +
      'Use this when a user asks "how do I...", "what is...", "how does... work", or needs help with any ' +
      'Ava feature. Returns the relevant documentation section(s).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What to search for. Can be a topic name (e.g. "models", "memory", "permissions") ' +
            'or a natural question (e.g. "how do I add an API key", "what models are available").',
        },
        topic: {
          type: 'string',
          enum: [
            'getting-started',
            'models',
            'tools',
            'modes',
            'permissions',
            'memory',
            'configuration',
            'project-context',
            'cli-commands',
            'languages',
            'keyboard-shortcuts',
            'troubleshooting',
            'platform-account',
            'dashboard',
            'history',
            'security-audit',
          ],
          description:
            'Optional: directly select a specific topic. If provided, returns that topic\'s full documentation.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim().toLowerCase();
    const topic = (args.topic as string)?.trim().toLowerCase();

    // Direct topic lookup — return the full section
    if (topic) {
      const section = AVA_DOCS.find(s => s.topic === topic);
      if (section) {
        return { success: true, output: section.content };
      }
      return {
        success: false,
        output: `Topic "${topic}" not found. Available topics: ${AVA_DOCS.map(s => s.topic).join(', ')}`,
      };
    }

    // No query and no topic — return topic list
    if (!query) {
      const list = AVA_DOCS.map(s => `- **${s.topic}** — ${s.title}`).join('\n');
      return {
        success: true,
        output: `# Available Documentation Topics\n\n${list}\n\nUse \`topic\` to get a specific section, or \`query\` to search across all docs.`,
      };
    }

    // Search: score each section by relevance
    const scored = AVA_DOCS.map(section => ({
      section,
      score: this.scoreSection(section, query),
    }));

    // Sort by score descending, filter out zero-relevance
    scored.sort((a, b) => b.score - a.score);
    const matches = scored.filter(s => s.score > 0);

    if (matches.length === 0) {
      return {
        success: true,
        output: `No documentation found matching "${query}". Available topics: ${AVA_DOCS.map(s => s.topic).join(', ')}`,
      };
    }

    // Return top matches (max 3 to keep output manageable)
    const topMatches = matches.slice(0, 3);

    // If the top match is significantly better, just return that one
    if (topMatches.length > 1 && topMatches[0].score > topMatches[1].score * 2) {
      return { success: true, output: topMatches[0].section.content };
    }

    // Otherwise return all top matches with separators
    const output = topMatches
      .map(m => m.section.content)
      .join('\n\n---\n\n');

    return { success: true, output };
  }

  /** Score how relevant a section is to the query. Higher = better match. */
  private scoreSection(section: DocSection, query: string): number {
    let score = 0;
    const words = query.split(/\s+/).filter(w => w.length > 1);

    // Exact topic match — highest priority
    if (section.topic === query || section.topic.replace(/-/g, ' ') === query) {
      score += 100;
    }

    // Keyword matches
    for (const keyword of section.keywords) {
      if (query.includes(keyword)) {
        score += 20;
      }
      // Check individual query words against keywords
      for (const word of words) {
        if (keyword.includes(word)) {
          score += 5;
        }
      }
    }

    // Title match
    const lowerTitle = section.title.toLowerCase();
    if (lowerTitle.includes(query)) {
      score += 30;
    }
    for (const word of words) {
      if (lowerTitle.includes(word)) {
        score += 8;
      }
    }

    // Content match — lower weight since content is large
    const lowerContent = section.content.toLowerCase();
    for (const word of words) {
      if (word.length > 2 && lowerContent.includes(word)) {
        score += 2;
      }
    }

    return score;
  }
}
