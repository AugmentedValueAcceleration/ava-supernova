// A stand-in for Blender Lab's MCP server: the same tool names and annotations
// (readme_tools.rst, v1.0.3), answering like the add-on does
// ({status, result | message}). No real Blender — the code is not run.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const VERSION = process.env.FAKE_BLENDER_VERSION || '5.3.0';
const ro = { readOnlyHint: true };
const tool = (name, annotations = ro, properties = {}) => ({ name, description: name, inputSchema: { type: 'object', properties }, annotations });

const TOOLS = [
  tool('execute_blender_code', { destructiveHint: true }, { code: { type: 'string' } }),
  tool('execute_blender_code_for_cli', { destructiveHint: true }, { blend_file: { type: 'string' }, code: { type: 'string' } }),
  tool('get_blendfile_summary_datablocks'), tool('get_blendfile_summary_datablocks_for_cli'),
  tool('get_objects_summary'), tool('get_object_detail_summary', ro, { name: { type: 'string' } }),
  tool('get_screenshot_of_area_as_image', ro, { area_ui_type: { type: 'string' } }),
  tool('get_screenshot_of_window_as_image'),
  tool('jump_to_view3d_object_by_name', ro, { name: { type: 'string' } }),
  tool('render_thumbnail_to_path', ro, { output_path: { type: 'string' } }),
  tool('render_viewport_to_path', ro, { output_path: { type: 'string' } }),
  tool('search_api_docs', ro, { query: { type: 'string' } }),
];

const server = new Server({ name: 'blender-mcp', version: '1.0.3' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  const json = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
  if (name === 'execute_blender_code') {
    const code = String(a.code ?? '');
    if (code.includes('bpy.app.version_string') && code.includes('"version"') && code.length < 120) return json({ status: 'ok', result: { version: VERSION } });
    if (code.includes('raise_please')) return json({ status: 'error', message: 'Traceback (most recent call last):\nNameError: raise_please' });
    return json({ status: 'ok', result: { ran: true }, stdout: 'printed by the step' });
  }
  if (name === 'get_screenshot_of_area_as_image') return { content: [{ type: 'image', data: PNG, mimeType: 'image/png' }] };
  if (name.startsWith('render_')) return json({ status: 'ok', result: { path: a.output_path } });
  return json({ status: 'ok', result: { tool: name } });
});
await server.connect(new StdioServerTransport());
