// Run in Node.js only — not imported by RN bundle

/**
 * CodeIndexer — a Node.js utility script that parses TypeScript/TSX source
 * files in a React Native project and produces a GraphNode[] manifest that
 * can be loaded into KnowledgeGraph.buildFromManifest() at app startup.
 *
 * Usage (Node.js CLI):
 *   node -e "require('./src/ai/CodeIndexer').indexProject('./src').then(m => console.log(JSON.stringify(m, null, 2)))"
 *
 * Or wire it into a package.json script:
 *   "applens:index": "ts-node src/ai/CodeIndexer.ts"
 */

import type { GraphNode, NodeType } from './KnowledgeGraph';

// Dynamic requires for Node.js built-ins — avoids bundler errors if this file
// is somehow encountered by Metro (Metro will never execute it, but it must
// not cause parse errors at analysis time).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as typeof import('path');

// ─── Regex patterns ──────────────────────────────────────────────────────────

/** Matches named function / arrow-function component declarations */
const COMPONENT_RE =
  /(?:export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*))|(?:(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*[:=].*(?:React\.FC|JSX\.Element|React\.JSX\.Element|=>))/g;

/** Matches React hook declarations (functions starting with 'use') */
const HOOK_RE =
  /(?:export\s+(?:default\s+)?function\s+(use[A-Z][A-Za-z0-9_]*))|(?:(?:export\s+)?const\s+(use[A-Z][A-Za-z0-9_]*)\s*[:=])/g;

/** Matches service/class declarations */
const SERVICE_CLASS_RE = /export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/g;

/** Matches import statements to extract dependency names */
const IMPORT_RE = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function collectCaptures(source: string, re: RegExp): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const cloned = new RegExp(re.source, re.flags);
  while ((match = cloned.exec(source)) !== null) {
    // Each regex has two capture groups — take the first truthy one
    const name = match[1] ?? match[2];
    if (name) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Derive import dependency names from import paths.
 * We extract the last segment of the import path (e.g. './OrderService' → 'OrderService')
 * and return only relative imports (skip node_modules).
 */
function extractImportNames(source: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(IMPORT_RE.source, IMPORT_RE.flags);
  while ((match = re.exec(source)) !== null) {
    const importPath = match[1];
    if (!importPath || importPath.startsWith('.') === false) {
      continue; // skip node_modules and absolute paths
    }
    const base = path.basename(importPath);
    // Strip extension-like suffixes, e.g. 'useCheckout.hook' → 'useCheckout'
    const name = base.replace(/\.(hook|service|api|store|screen|component)$/, '');
    if (name) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Classify a file by its name/path into a NodeType.
 */
function classifyFile(filePath: string): NodeType {
  const lower = filePath.toLowerCase();
  if (lower.includes('screen') || lower.endsWith('.screen.tsx') || lower.endsWith('.screen.ts')) {
    return 'screen';
  }
  if (lower.includes('.service.') || lower.includes('/services/')) {
    return 'service';
  }
  if (lower.includes('.api.') || lower.includes('/api/')) {
    return 'api';
  }
  if (lower.includes('.store.') || lower.includes('/store/') || lower.includes('/stores/')) {
    return 'store';
  }
  if (lower.includes('.hook.') || lower.includes('/hooks/')) {
    return 'hook';
  }
  return 'component';
}

/**
 * Recursively walk a directory and return all .ts / .tsx file paths.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      results.push(...walkDir(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Index all TypeScript/TSX files under projectRoot and produce a GraphNode[]
 * manifest ready for KnowledgeGraph.buildFromManifest().
 *
 * @param projectRoot - Absolute or relative path to the app's source directory
 */
export async function indexProject(projectRoot: string): Promise<GraphNode[]> {
  const files = walkDir(path.resolve(projectRoot));
  const nodes: GraphNode[] = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(projectRoot, filePath);
    const fileType = classifyFile(filePath);
    const importedDeps = extractImportNames(source);

    // Collect entity names defined in this file
    let definedNames: string[] = [];

    if (fileType === 'hook') {
      definedNames = collectCaptures(source, HOOK_RE);
    } else if (fileType === 'service' || fileType === 'api') {
      const classNames = collectCaptures(source, SERVICE_CLASS_RE);
      const hookNames = collectCaptures(source, HOOK_RE);
      definedNames = [...classNames, ...hookNames];
    } else {
      // screen / component / store
      const componentNames = collectCaptures(source, COMPONENT_RE);
      const hookNames = collectCaptures(source, HOOK_RE);
      definedNames = [...componentNames, ...hookNames];
    }

    // Also check for any hook declarations regardless of file type
    if (fileType !== 'hook') {
      const extraHooks = collectCaptures(source, HOOK_RE);
      for (const h of extraHooks) {
        if (!definedNames.includes(h)) {
          definedNames.push(h);
        }
      }
    }

    if (definedNames.length === 0) {
      // Use the file's base name as fallback node name
      const fallback = path.basename(relativePath).replace(/\.(tsx?|jsx?)$/, '');
      definedNames = [fallback];
    }

    // Each top-level entity in the file gets its own node; they share deps
    for (const name of definedNames) {
      nodes.push({
        name,
        type: fileType,
        file: relativePath,
        dependencies: importedDeps.filter((d) => d !== name),
      });
    }
  }

  return nodes;
}
