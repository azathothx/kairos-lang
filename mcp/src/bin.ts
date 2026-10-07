#!/usr/bin/env node
// stdio で起動する入口（`npx kairos-lang-mcp`）。ログは stderr（stdout は MCP の線）
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, SERVER_VERSION } from './server.ts';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(SERVER_VERSION);
} else {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`kairos-lang-mcp ${SERVER_VERSION}: listening on stdio`);
}
