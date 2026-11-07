/**
 * What Ava is asking permission for, in plain words. A permission card is read by
 * people who have never seen a tool name or a line of JSON, and they are being
 * asked to decide something, so it has to say what will happen.
 */

const short = (value: unknown, max = 100) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const WEIGHTS: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

const list = (items: string[]) =>
  (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** "design_build_image" → "design build image", for a tool with no words of its own. */
const toolWords = (name: string) => name.replace(/[_-]+/g, ' ').trim();

export function toolRequestInWords(toolName: string, args: Record<string, unknown>): string {
  const file = short(args.file_path ?? args.path, 80);
  switch (toolName) {
    case 'design_install_font': {
      const weights = Array.isArray(args.weights) ? args.weights.map((w) => WEIGHTS[Number(w)]).filter(Boolean) : [];
      return `Install the free ${short(args.family, 60)} font${weights.length ? ` (${list(weights)})` : ''} on your computer. It's openly licensed, and only your user account gets it.`;
    }
    case 'bash': return `Run this command: ${short(args.command)}`;
    case 'file_write': case 'write': return `Create or replace the file ${file}`;
    case 'file_edit': case 'edit': return `Change the file ${file}`;
    case 'list_directory': return `Look through the folder ${file}`;
    case 'web_search': return `Search the web for: ${short(args.query, 80)}`;
    case 'http_request': return `Contact ${short(args.url, 80)}`;
    case 'git_commit': return `Save your changes to Git${args.message ? `: ${short(args.message, 80)}` : ''}`;
    case 'git_create_pr': return `Open a pull request${args.title ? `: ${short(args.title, 80)}` : ''}`;
    case 'present_plan': return `Plan: ${short(args.title ?? 'Untitled')}`;
    case 'ask_user': return short(args.question ?? 'Question', 200);
    default: return `Use its "${toolWords(toolName)}" tool`;
  }
}
