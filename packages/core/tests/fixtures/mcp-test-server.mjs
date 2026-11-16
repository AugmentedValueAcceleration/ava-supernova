// A tiny real MCP server for the client tests. Started as a local program
// (stdio) by default, or on a local web address with `--http <port>`.
// Three tools: echo (read-only text), snapshot (an image), fail (an error).
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// A 1x1 transparent PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function makeServer() {
  const server = new Server({ name: 'test-blender', version: '0.0.1' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'echo', description: 'Say it back', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, annotations: { readOnlyHint: true } },
      { name: 'snapshot', description: 'Look at the viewport', inputSchema: { type: 'object', properties: {} } },
      { name: 'fail', description: 'Always fails', inputSchema: { type: 'object', properties: {} }, annotations: { destructiveHint: true } },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (name === 'echo') return { content: [{ type: 'text', text: `echo: ${args?.text ?? ''}` }] };
    if (name === 'snapshot') return { content: [{ type: 'text', text: 'viewport' }, { type: 'image', data: PNG, mimeType: 'image/png' }, { type: 'image', data: PNG, mimeType: 'image/png' }] };
    if (name === 'fail') return { isError: true, content: [{ type: 'text', text: 'Blender said no' }] };
    throw new Error(`unknown tool ${name}`);
  });
  return server;
}

const httpAt = process.argv.indexOf('--http');
if (httpAt === -1) {
  process.stderr.write('test server starting\n');
  await makeServer().connect(new StdioServerTransport());
} else {
  const port = Number(process.argv[httpAt + 1]);
  const http = createServer(async (req, res) => {
    // Stateless: a fresh server + transport per request.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = makeServer();
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => transport.handleRequest(req, res, body ? JSON.parse(body) : undefined));
  });
  http.listen(port, '127.0.0.1', () => process.stdout.write(`listening ${port}\n`));
}
