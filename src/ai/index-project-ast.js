#!/usr/bin/env node
/**
 * AppLens CLI (AST variant) — index a React Native project's source tree using
 * the TypeScript compiler API (AstCodeIndexer).
 *
 * Usage:
 *   node src/ai/index-project-ast.js /path/to/app
 *   node src/ai/index-project-ast.js /path/to/app/src
 *
 * Outputs a JSON array of GraphNode objects (stdout) — byte-compatible with the
 * regex variant — that can be fed into KnowledgeGraph.buildFromManifest().
 *
 * Example (pipe to a file for use in the app):
 *   node src/ai/index-project-ast.js ./src > knowledge-graph-ast.json
 *
 * This mirrors index-project.js but loads the AST-based AstCodeIndexer. Both
 * CLIs are kept so the two indexers can be run and compared independently.
 */

'use strict';

// Support both pre-compiled JS (dist/) and ts-node / direct require of .ts
let indexProject;
try {
  // When consumed from the published npm package (dist/ai/AstCodeIndexer.js)
  ({ indexProject } = require('./AstCodeIndexer'));
} catch (_) {
  // Fallback: try ts-node if the TypeScript source is available
  try {
    require('ts-node').register({ transpileOnly: true });
    ({ indexProject } = require('./AstCodeIndexer.ts'));
  } catch (err) {
    console.error(
      'AppLens: could not load AstCodeIndexer.\n' +
        'Run from the package root with either the compiled output or ts-node installed.\n' +
        String(err),
    );
    process.exit(1);
  }
}

const projectRoot = process.argv[2];

if (!projectRoot) {
  console.error(
    'Usage: node src/ai/index-project-ast.js <path-to-project-root>\n' +
      'Example: node src/ai/index-project-ast.js ./src',
  );
  process.exit(1);
}

indexProject(projectRoot)
  .then(function (nodes) {
    process.stdout.write(JSON.stringify(nodes, null, 2) + '\n');
  })
  .catch(function (err) {
    console.error('AppLens indexProject (AST) failed:', err);
    process.exit(1);
  });
