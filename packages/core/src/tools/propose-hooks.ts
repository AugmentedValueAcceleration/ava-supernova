import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { HookStore, HookOption } from '../social/index.js';

/**
 * Offer the operator 2–3 candidate opening hooks BEFORE writing the full post.
 * Side-effect-free: validate + hand the proposal to the surface-injected
 * `hookStore`, which the surface renders as a picker. Then Ava WAITS for the
 * operator to choose (the persona rule) — unless they delegated the call.
 */
export class ProposeHooksTool implements Tool {
  readonly name = 'propose_hooks';
  readonly description =
    'Offer the operator 2-3 candidate opening hooks to choose from before writing the full post. Then WAIT — do not write_post in the same turn unless the operator delegated the choice.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_hooks',
    description:
      'Offer the operator 2-3 candidate opening hooks to choose from BEFORE writing the full post. Call this after research_post when starting a NEW post from a subject/brief — the hook decides whether the post lands, so the operator picks the angle first. Then WAIT: do not call write_post in the same turn. When the operator replies with their chosen hook, build the body around it. Skip this only for follow-ups (cross-posting existing content, rewrites), when the operator already gave you the exact hook/wording, delegated the choice ("you decide"), or for trivial banter.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The subject the hooks are for — echoed back so the follow-up turn has context.' },
        platform: { type: 'string', description: 'Target platform for the eventual post (tweet, linkedin, etc.).' },
        hooks: {
          type: 'array',
          description: '2-3 candidate opening lines, each with a one-line angle/rationale.',
          items: {
            type: 'object',
            properties: {
              hook: { type: 'string', description: 'The opening line itself — sharp, specific, scroll-stopping.' },
              angle: { type: 'string', description: 'One line on why this hook works / what angle it takes (e.g. "contrarian", "curiosity gap", "stat shock").' },
            },
            required: ['hook', 'angle'],
          },
        },
      },
      required: ['hooks'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.hookStore as HookStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Hook proposal is not available in this context. The host must inject `hookStore` into shared state.',
      };
    }

    const rawHooks = Array.isArray(args.hooks) ? (args.hooks as unknown[]) : [];
    const hooks: HookOption[] = rawHooks
      .map((h) => {
        const o = (h && typeof h === 'object') ? h as Record<string, unknown> : {};
        return { hook: String(o.hook || '').trim(), angle: String(o.angle || '').trim() || null };
      })
      .filter(h => h.hook)
      .slice(0, 3);

    if (hooks.length === 0) {
      return { success: false, output: 'propose_hooks requires at least one hook.' };
    }

    const subject = ((args.subject as string | undefined)?.trim()) || '';
    const platform = ((args.platform as string | undefined)?.trim()) || 'tweet';

    try {
      await store.propose({ subject, platform, hooks });
      return {
        success: true,
        output: `Proposed ${hooks.length} hook${hooks.length === 1 ? '' : 's'} for the operator to pick — WAIT for their choice before writing (unless they told you to decide).`,
        metadata: { count: hooks.length, subject, platform },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to propose hooks: ${msg}` };
    }
  }
}
