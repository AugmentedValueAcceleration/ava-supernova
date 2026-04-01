import type { Message, ModelDefinition, ContentPart } from '../core/types.js';
import type { TaskBrief } from './types.js';

// Regex to extract file paths from messages
const FILE_PATH_PATTERN = /(?:^|\s)((?:[\w@.-]+\/)*[\w.-]+\.\w{1,10})(?:\s|$|[,;:)])/g;

/**
 * Generate a focused task brief for a spawned agent.
 * Entirely programmatic — no LLM call, ~0ms.
 */
export function generateBrief(
  userMessage: string | ContentPart[],
  conversationHistory: Message[],
  relevantMemories: string,
  projectInstructions: string,
  targetModel: ModelDefinition,
): TaskBrief {
  const task = typeof userMessage === 'string'
    ? userMessage
    : userMessage
        .filter(p => p.type === 'text')
        .map(p => (p as { text: string }).text)
        .join('\n');

  // Extract last 4 user+assistant exchanges, truncate each to 300 chars
  const recentMessages = conversationHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-8) // last 4 exchanges = 8 messages
    .map(m => {
      const content = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join(' ')
          : '';
      const truncated = content.length > 300 ? content.slice(0, 300) + '...' : content;
      return `[${m.role}]: ${truncated}`;
    })
    .join('\n');

  // Extract file paths from recent messages
  const files = new Set<string>();
  for (const msg of conversationHistory.slice(-10)) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    let match;
    while ((match = FILE_PATH_PATTERN.exec(content)) !== null) {
      files.add(match[1]);
    }
  }

  const constraints = `You are running on ${targetModel.name} (${targetModel.contextWindow.toLocaleString()} token context). ` +
    `Complete the task autonomously. When done, provide a clear summary of what you did.` +
    (targetModel.supportsVision ? '' : ' You cannot process images.') +
    (targetModel.supportsThinking ? ' You have extended thinking capabilities.' : '');

  return {
    task,
    context: recentMessages || '(new conversation)',
    relevantMemories: relevantMemories || '(none)',
    projectContext: projectInstructions ? projectInstructions.slice(0, 2000) : '(none)',
    constraints,
    files: [...files],
  };
}

/** Format a TaskBrief into a system prompt injection for the spawned agent */
export function formatBriefAsSystem(brief: TaskBrief): string {
  const parts: string[] = [
    `## Task\n${brief.task}`,
  ];

  if (brief.context && brief.context !== '(new conversation)') {
    parts.push(`## Recent Conversation Context\n${brief.context}`);
  }

  if (brief.relevantMemories && brief.relevantMemories !== '(none)') {
    parts.push(`## Relevant Memories\n${brief.relevantMemories}`);
  }

  if (brief.files.length > 0) {
    parts.push(`## Relevant Files\n${brief.files.join('\n')}`);
  }

  parts.push(`## Constraints\n${brief.constraints}`);

  return parts.join('\n\n');
}
