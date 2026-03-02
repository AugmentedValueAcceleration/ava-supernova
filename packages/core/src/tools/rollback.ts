import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { CheckpointManager } from '../checkpoint/checkpoint-manager.js';

const ALLOWED_ACTIONS = new Set(['restore', 'discard', 'status']);

export class RollbackTool implements Tool {
  readonly name = 'rollback';
  readonly description = 'Restore, discard, or check the status of a git checkpoint';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'rollback',
    description:
      'Manage git checkpoints for undoing changes. Before you make file changes, ' +
      'a checkpoint is automatically created via git stash. If something goes wrong, ' +
      'use "restore" to undo all changes back to the checkpoint. ' +
      'Use "status" to check if a checkpoint exists. Use "discard" to clear the checkpoint ' +
      'when you\'re happy with the changes.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['restore', 'discard', 'status'],
          description:
            'Action to perform: "restore" undoes changes back to checkpoint, ' +
            '"discard" clears the checkpoint (keeps current changes), ' +
            '"status" reports whether a checkpoint exists.',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const action = args.action as string;

    if (!ALLOWED_ACTIONS.has(action)) {
      return {
        success: false,
        output: `Invalid action "${action}". Use one of: ${[...ALLOWED_ACTIONS].join(', ')}`,
      };
    }

    const checkpointManager = context.sharedState?.checkpointManager as CheckpointManager | undefined;
    if (!checkpointManager) {
      return { success: false, output: 'Checkpoint system is not available in this context.' };
    }

    try {
      switch (action) {
        case 'status': {
          const info = await checkpointManager.getStashInfo();
          return {
            success: true,
            output: info,
            metadata: { hasCheckpoint: checkpointManager.hasActiveCheckpoint() },
          };
        }
        case 'restore': {
          if (!checkpointManager.hasActiveCheckpoint()) {
            return { success: false, output: 'No active checkpoint to restore.' };
          }
          const restored = await checkpointManager.restoreCheckpoint();
          return restored
            ? { success: true, output: 'Checkpoint restored. All changes since the checkpoint have been undone.' }
            : { success: false, output: 'Failed to restore checkpoint. The stash may have conflicts — resolve manually with `git stash pop`.' };
        }
        case 'discard': {
          if (!checkpointManager.hasActiveCheckpoint()) {
            return { success: true, output: 'No active checkpoint to discard.' };
          }
          await checkpointManager.discardCheckpoint();
          return { success: true, output: 'Checkpoint discarded. Current changes are kept.' };
        }
        default:
          return { success: false, output: `Unknown action: ${action}` };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Rollback action failed: ${message}` };
    }
  }
}
