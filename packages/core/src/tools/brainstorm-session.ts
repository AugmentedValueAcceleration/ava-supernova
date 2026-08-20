import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { BrainstormStore } from '../brainstorm/brainstorm-store.js';
import type { BrainstormIdeaStatus, BrainstormKind, BrainstormSession } from '../brainstorm/types.js';

/**
 * The brainstorm session store, as a tool.
 *
 * Brainstorm mode is for someone who is not ready to commit yet. If nothing is
 * written down until they commit, the sessions most worth keeping are the ones
 * lost — explore five ideas over an evening, pick none, close the app, and
 * Thursday starts from nothing. Which is the exact feeling the mode exists to
 * relieve.
 *
 * So the session is saved as it happens, locally, and `attach` binds it to a
 * project the moment one is created.
 *
 * NOT memory. Memory holds durable facts about the PERSON — "prefers small
 * finishable projects", "learning Rust" — which are useful in every mode
 * forever. This holds the session: the ideas, the ones turned down, and why.
 * Saving every musing to memory degrades recall and leaves Ava quoting
 * half-thoughts back as settled fact.
 */
export class BrainstormSessionTool implements Tool {
  readonly name = 'brainstorm_session';
  readonly description =
    'Keep and recall brainstorming sessions — ideas, the ones that were parked or rejected, and why. ' +
    'Stored locally under ~/.ava, never in the project and never committed. ' +
    'Use recall at the START of a brainstorm to see what they were circling before; save as ideas emerge; ' +
    'attach when a project folder gets created so the thinking follows the project.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'brainstorm_session',
    description:
      'Local brainstorm memory. recall — list past sessions (call this early; "you were circling this three weeks ago" ' +
      'is the most useful thing you can say to someone stuck). save — create or update a session with its ideas. ' +
      'attach — bind a session to a project path once the folder exists. read — load one session in full.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['recall', 'save', 'attach', 'read'],
          description: 'What to do',
        },
        session_id: {
          type: 'string',
          description: 'Session to update, read, or attach. Omit on save to start a new one.',
        },
        kind: {
          type: 'string',
          enum: ['blank', 'evolve'],
          description: 'save: which conversation this is — no project yet ("blank"), or an existing one ("evolve").',
        },
        headline: {
          type: 'string',
          description: 'save: what the session is about, in the user\'s own terms.',
        },
        ideas: {
          type: 'array',
          description:
            'save: the ideas so far. Include rejected ones WITH a reason — an idea turned down and not recorded ' +
            'gets proposed again next time, and the reason is the useful half.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short name' },
              summary: { type: 'string', description: 'A sentence or two — enough to recognise it months later' },
              status: {
                type: 'string',
                enum: ['candidate', 'chosen', 'parked', 'rejected'],
                description: 'Where it got to',
              },
              reason: { type: 'string', description: 'Why parked or rejected' },
            },
            required: ['title', 'summary', 'status'],
          },
        },
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: 'save: threads worth keeping that are not ideas — constraints, tangents, context.',
        },
        project_path: {
          type: 'string',
          description: 'attach: absolute path of the project folder this session produced.',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = new BrainstormStore();
    const action = String(args.action ?? '');
    const projectRoot = context.cwd;

    try {
      switch (action) {
        case 'recall': {
          const sessions = await store.list(projectRoot);
          if (sessions.length === 0) {
            return { success: true, output: 'No previous brainstorm sessions. This is a first conversation.' };
          }
          const lines = sessions.slice(0, 12).map((s) => {
            const when = s.updatedAt.slice(0, 10);
            const open = s.openCount > 0 ? `, ${s.openCount} still open` : '';
            return `- [${s.id}] ${when} · ${s.kind} · ${s.headline} (${s.ideaCount} ideas${open})`;
          });
          return {
            success: true,
            output: `${sessions.length} previous session(s):\n${lines.join('\n')}\n\nRead one with action="read" before assuming what was covered.`,
          };
        }

        case 'read': {
          const id = String(args.session_id ?? '');
          if (!id) return { success: false, output: 'session_id is required to read a session.' };
          const session = await store.get(id, projectRoot);
          if (!session) return { success: false, output: `No session ${id}.` };
          return { success: true, output: JSON.stringify(session, null, 2) };
        }

        case 'save': {
          const id = args.session_id ? String(args.session_id) : null;
          let session: BrainstormSession | null = id ? await store.get(id, projectRoot) : null;

          if (!session) {
            const kind = (args.kind === 'evolve' ? 'evolve' : 'blank') as BrainstormKind;
            const headline = String(args.headline ?? 'Untitled session');
            // A brand-new session in an existing project is already attached —
            // there is no point putting it in the loose pile only to move it.
            session = store.create(kind, headline, kind === 'evolve' ? projectRoot : undefined);
          } else if (args.headline) {
            session.headline = String(args.headline);
          }

          const incoming = Array.isArray(args.ideas) ? args.ideas : [];
          for (const raw of incoming as Array<Record<string, unknown>>) {
            if (!raw?.title) continue;
            const title = String(raw.title);
            const existing = session.ideas.find((i) => i.title === title);
            if (existing) {
              existing.summary = String(raw.summary ?? existing.summary);
              existing.status = (raw.status as BrainstormIdeaStatus) ?? existing.status;
              if (raw.reason) existing.reason = String(raw.reason);
              existing.updatedAt = new Date().toISOString();
            } else {
              store.addIdea(session, {
                title,
                summary: String(raw.summary ?? ''),
                status: (raw.status as BrainstormIdeaStatus) ?? 'candidate',
                ...(raw.reason ? { reason: String(raw.reason) } : {}),
              });
            }
          }

          if (Array.isArray(args.notes)) {
            for (const n of args.notes as unknown[]) {
              const note = String(n).trim();
              if (note && !session.notes.includes(note)) session.notes.push(note);
            }
          }

          await store.save(session);
          return {
            success: true,
            output: `Saved session ${session.id} (${session.ideas.length} ideas). Kept locally — not in the project.`,
          };
        }

        case 'attach': {
          const id = String(args.session_id ?? '');
          const path = String(args.project_path ?? '');
          if (!id || !path) {
            return { success: false, output: 'attach needs both session_id and project_path.' };
          }
          const session = await store.attach(id, path);
          if (!session) return { success: false, output: `No loose session ${id} to attach.` };
          return { success: true, output: `Session ${id} now belongs to ${path}.` };
        }

        default:
          return { success: false, output: `Unknown action "${action}".` };
      }
    } catch (err) {
      return { success: false, output: `Brainstorm store failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
