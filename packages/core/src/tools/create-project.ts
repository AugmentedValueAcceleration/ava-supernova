import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { projectsHome } from '../projects/project-data.js';
import { scaffoldDecisionsFolder } from '../config/project.js';

/**
 * Create a new project folder — the one write that happens outside the
 * sandbox, and nothing more.
 *
 * WHY THIS EXISTS. Every other file tool is confined to the open project root,
 * which is correct and worth keeping. But it makes "start me a new project"
 * impossible to answer honestly: asked for one while a different project is
 * open, the only place I am allowed to write is inside THAT project. So a new
 * app lands inside someone's Unreal repo, self-contained and tidy and in
 * completely the wrong place — sitting in their git working tree, one
 * `git add -A` away from a commit nobody wanted.
 *
 * The sandbox was not wrong. Nothing could create a project at all: this
 * codebase already knew WHERE projects live (projects-home.ts) and had nothing
 * that could MAKE one.
 *
 * WHY IT IS NOT A WIDER PERMISSION. The obvious alternative — let the file
 * tools write to the projects home as well — turns a hard boundary into a soft
 * one for every tool, permanently, to solve something that happens once per
 * project. This creates a directory under the projects home and returns its
 * path. It cannot write files, cannot touch an existing project, and cannot
 * reach anywhere else. Everything after the folder exists happens the normal
 * sandboxed way, once it is open.
 */
export class CreateProjectTool implements Tool {
  readonly name = 'create_project';
  readonly description = 'Create a new, empty project folder in the user\'s projects home';
  // 'write' rather than 'dangerous': it creates one empty directory in a known
  // place and refuses to touch anything that already exists. Marking it
  // dangerous would train people to click through the prompt that guards
  // genuinely destructive things.
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'create_project',
    description:
      'Create a new, empty project folder in the user\'s projects home ' +
      '(~/.ava/projects by default) and return its absolute path. ' +
      'Use this when the user asks to START A NEW PROJECT rather than work on ' +
      'the one that is open — every other file tool is restricted to the ' +
      'currently open project, so without this a new project would be created ' +
      'inside the existing one. ' +
      'This ONLY creates the folder. Tell the user the path and ask them to ' +
      'open it, because you cannot write files into it until it is the open ' +
      'project. Do not use it to make a subfolder of the current project.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Folder name for the new project, e.g. "todo-cli". A plain name, ' +
            'not a path — no slashes, and it cannot start with a dot.',
        },
      },
      required: ['name'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const raw = typeof args.name === 'string' ? args.name.trim() : '';
    if (!raw) {
      return { success: false, output: 'A project name is required.' };
    }

    // A NAME, not a path. Rejecting separators and dot-segments outright is
    // what keeps this from becoming a way to write anywhere on the disk: with
    // "../.." accepted, a tool whose whole justification is that it can only
    // reach one directory would reach every directory.
    if (/[\\/]/.test(raw) || raw === '.' || raw === '..' || raw.startsWith('.')) {
      return {
        success: false,
        output:
          `"${raw}" is not a valid project name. Give a plain folder name with no ` +
          'slashes, and not starting with a dot.',
      };
    }
    // Windows refuses these outright and the failure is obscure when it comes
    // from the filesystem instead of from here.
    // eslint-disable-next-line no-control-regex -- control characters are refused in names on purpose
    if (/[<>:"|?*\x00-\x1f]/.test(raw)) {
      return {
        success: false,
        output: `"${raw}" contains characters that are not allowed in a folder name.`,
      };
    }

    // Each host resolves preferences.projectsHome its own way — VS Code
    // settings in the extension, ~/.ava/config.json in the sidecar — and hands
    // it in, the same way getBrainstormModePrefix already receives it. Absent,
    // the default is the right answer for anyone who has not chosen otherwise.
    const configured = typeof context.sharedState?.projectsHome === 'string'
      ? (context.sharedState.projectsHome as string)
      : undefined;
    const home = projectsHome(configured);
    const target = resolve(join(home, raw));

    // Belt and braces. The name checks above should make this unreachable, but
    // the cost of being wrong is writing outside the projects home, so the
    // resolved path is confirmed to still be inside it.
    const homeResolved = resolve(home);
    if (target !== homeResolved && !target.startsWith(homeResolved + (homeResolved.includes('\\') ? '\\' : '/'))) {
      return { success: false, output: 'Refusing to create a project outside the projects home.' };
    }

    // Never adopt or overwrite an existing folder. Somebody else's project
    // silently becoming the target of "create" is the kind of thing that
    // destroys work, so an existing name is an error the user resolves.
    try {
      const existing = await readdir(target);
      return {
        success: false,
        output:
          `A folder named "${raw}" already exists at ${target}` +
          (existing.length ? ` and is not empty (${existing.length} entries).` : '.') +
          ' Choose a different name, or open that folder if it is the project you meant.',
      };
    } catch {
      // Does not exist — which is the case we want.
    }

    try {
      await mkdir(target, { recursive: true });
    } catch (err) {
      return {
        success: false,
        output: `Could not create ${target}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Every project starts with its Decisions folder. Plans and decision
    // records live there, so leaving it to be offered later means the thing
    // that matters most is the thing that might not happen. There is nobody to
    // ask here anyway — the folder was made a second ago at the user's
    // request. A project she did NOT create still gets the ask-flow, because
    // scaffolding into someone else's repo uninvited is a different question.
    let decisions = false;
    try {
      await scaffoldDecisionsFolder(target);
      decisions = true;
    } catch {
      // The folder is the deliverable; Decisions is a strong default on top of
      // it. Reporting failure now would hand back a project that exists
      // alongside a message saying it did not work.
    }

    return {
      success: true,
      output:
        `Created ${target}\n\n` +
        (decisions
          ? 'It has a Decisions/ folder — plans and decision records go there, ' +
            'and it is committed to git.\n\n'
          : '') +
        'The folder is NOT the open project yet — file tools are still ' +
        'restricted to the currently open one. Ask the user to open this ' +
        'folder, then the work can start in it.',
      metadata: { path: target, name: raw, projectsHome: home, decisions },
    };
  }
}
