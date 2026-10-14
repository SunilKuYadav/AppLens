#!/usr/bin/env node
/**
 * AppLens Agent CLI — run the Node-only agent backend that lets the AI tab read
 * project files and propose patches over a local WebSocket.
 *
 * Usage:
 *   node src/ai/index-agent.js --project .
 *   npx applens-agent --project . --port 4747
 *
 * Flags:
 *   --project <dir>   workspace root (default: cwd)
 *   --port <n>        listen port (default: 4747)
 *   --host <addr>     bind address (default: 127.0.0.1; 0.0.0.0 for LAN)
 *   --token <str>     fixed pairing token (default: a minted single-session one)
 *
 * This mirrors index-project-ast.js: it loads the compiled agent CLI from dist/
 * and falls back to ts-node (transpileOnly) when only the TypeScript source is
 * available.
 */

'use strict';

// Support both pre-compiled JS (dist/agent/cli.js) and ts-node / direct require.
let main;
try {
  // When consumed from the published npm package (dist/agent/cli.js).
  ({ main } = require('../agent/cli'));
} catch (_) {
  // Fallback: try ts-node if the TypeScript source is available.
  try {
    require('ts-node').register({ transpileOnly: true });
    ({ main } = require('../agent/cli.ts'));
  } catch (err) {
    console.error(
      'AppLens: could not load the agent CLI.\n' +
        'Run from the package root with either the compiled output (npm run build) or ts-node installed.\n' +
        String(err),
    );
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error('AppLens Agent failed:', err);
  process.exit(1);
});
