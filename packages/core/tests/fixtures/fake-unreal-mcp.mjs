// A pretend Unreal Engine MCP server for the Unreal tests (plan 2026-11-18-unreal).
// Shaped like the real one read from his 5.9 editor on 18 Nov 2026: it reports
// itself as "unreal-mcp", offers four meta-tools, and every inner tool carries
// annotations.accessMode (read / write / execute). Local program (stdio).
//
//   --off             the project's toolset plugins are off: no actor / level / asset toolsets
//   --version <v>     report this engine version (default 5.9.0-test)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const off = process.argv.includes('--off');
const versionAt = process.argv.indexOf('--version');
const version = versionAt === -1 ? '5.9.0-test' : process.argv[versionAt + 1];

const TOOLSETS = {
  'EditorToolset.ActorToolset': {
    description: 'Actors in the open level.',
    tools: { ListActors: 'read', SpawnActor: 'write', DeleteActor: 'write' },
  },
  'EditorToolset.LevelToolset': { description: 'Levels.', tools: { GetCurrentLevel: 'read' } },
  'EditorToolset.EditorAppToolset': { description: 'The editor.', tools: { StartPIE: 'execute', StopPIE: 'write' } },
  'Test.SlowToolset': { description: 'Takes a while.', tools: { Wait: 'read' } },
};
if (off) {
  delete TOOLSETS['EditorToolset.ActorToolset'];
  delete TOOLSETS['EditorToolset.LevelToolset'];
}

let running = 0;
let most = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (t) => ({ content: [{ type: 'text', text: t }] });

const server = new Server({ name: 'unreal-mcp', version }, { capabilities: { tools: { listChanged: true } } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'call_tool', description: 'Call a tool by name.', inputSchema: { type: 'object', properties: { toolset_name: { type: 'string' }, tool_name: { type: 'string' }, arguments: { type: 'object' } }, required: ['tool_name'] } },
    { name: 'describe_tools', description: 'Schemas.', inputSchema: { type: 'object', properties: { tool_names: { type: 'array', items: { type: 'string' } } }, required: ['tool_names'] }, annotations: { readOnlyHint: true } },
    { name: 'describe_toolsets', description: 'Toolsets.', inputSchema: { type: 'object', properties: { toolset_names: { type: 'array', items: { type: 'string' } } }, required: ['toolset_names'] }, annotations: { readOnlyHint: true } },
    { name: 'list_toolsets', description: 'List toolsets.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  if (name === 'list_toolsets') {
    // Like the real one: "- Name: description", and descriptions may run over lines that also start with "- ".
    return text(Object.entries(TOOLSETS).map(([n, s]) => `- ${n}: ${s.description}\n- Graph\n  more words`).join('\n'));
  }
  if (name === 'describe_toolsets') {
    const toolsets = {};
    const errors = {};
    for (const n of args.toolset_names ?? []) {
      const s = TOOLSETS[n];
      if (!s) { errors[n] = `Toolset '${n}' not found.`; continue; }
      toolsets[n] = { name: n, tools: Object.entries(s.tools).map(([t, mode]) => ({ name: `${n}.${t}`, description: t, annotations: { accessMode: mode } })) };
    }
    return text(JSON.stringify({ toolsets, errors }));
  }
  if (name === 'call_tool') {
    const full = args.toolset_name ? `${args.toolset_name}.${args.tool_name}` : args.tool_name;
    running++; most = Math.max(most, running);
    try {
      if (full === 'Test.SlowToolset.Wait') { await sleep(150); return text(`waited; most at once: ${most}`); }
      return text(`ran ${full}`);
    } finally { running--; }
  }
  throw new Error(`unknown tool ${name}`);
});

await server.connect(new StdioServerTransport());
