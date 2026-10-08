#!/usr/bin/env node
/**
 * AppLens CLI — index a React Native project's source tree.
 *
 * Usage:
 *   node src/ai/index-project.js /path/to/app
 *   node src/ai/index-project.js /path/to/app/src
 *
 * Outputs a JSON array of GraphNode objects (stdout) that can be fed into
 * KnowledgeGraph.buildFromManifest() at app startup.
 *
 * Example (pipe to a file for use in the app):
 *   node src/ai/index-project.js ./src > knowledge-graph.json
 */

'use strict';

// Support both pre-compiled JS (dist/) and ts-node / direct require of .ts
let indexProject;
try {
  // When consumed from the published npm package (dist/ai/CodeIndexer.js)
  ({ indexProject } = require('./CodeIndexer'));
} catch (_) {
  // Fallback: try ts-node if the TypeScript source is available
  try {
    require('ts-node').register({ transpileOnly: true });
    ({ indexProject } = require('./CodeIndexer.ts'));
  } catch (err) {
    console.error(
      'AppLens: could not load CodeIndexer.\n' +
        'Run from the package root with either the compiled output or ts-node installed.\n' +
        String(err),
    );
    process.exit(1);
  }
}

const projectRoot = process.argv[2];

if (!projectRoot) {
  console.error(
    'Usage: node src/ai/index-project.js <path-to-project-root>\n' +
      'Example: node src/ai/index-project.js ./src',
  );
  process.exit(1);
}

indexProject(projectRoot)
  .then(function (nodes) {
    process.stdout.write(JSON.stringify(nodes, null, 2) + '\n');
  })
  .catch(function (err) {
    console.error('AppLens indexProject failed:', err);
    process.exit(1);
  });
