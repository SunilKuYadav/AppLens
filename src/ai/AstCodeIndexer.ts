// Run in Node.js only — not imported by RN bundle

/**
 * AstCodeIndexer — the AST-based variant of CodeIndexer.
 *
 * This is a Node.js-only utility script. It parses TypeScript/TSX source files
 * in a React Native project using the TypeScript compiler API (the `typescript`
 * package) and produces a GraphNode[] manifest that is byte-compatible with the
 * output of CodeIndexer.ts (the regex variant) and can be loaded directly into
 * KnowledgeGraph.buildFromManifest() at app startup.
 *
 * Why a separate variant?
 *   The regex indexer (CodeIndexer.ts) matches declarations with regular
 *   expressions, which is blunt — it over-/under-counts in edge cases (default
 *   exports, const components typed only via JSX, etc.). This variant walks the
 *   real AST for accurate detection of exported declarations, hooks and classes.
 *   Both indexers are kept side by side so their output can be compared.
 *
 * IMPORTANT: this file imports `typescript` at runtime, so it must only ever be
 * executed by Node.js. It is NEVER bundled into the React Native app (Metro will
 * never execute it). The regex variant exists precisely so the RN side has no
 * compiler dependency.
 *
 * Usage (Node.js CLI):
 *   node -e "require('./src/ai/AstCodeIndexer').indexProject('./src').then(m => console.log(JSON.stringify(m, null, 2)))"
 *
 * Or via the dedicated wrapper:
 *   node src/ai/index-project-ast.js ./src > knowledge-graph-ast.json
 */

import type { GraphNode, NodeType } from './KnowledgeGraph';

// Dynamic requires for Node.js built-ins — avoids bundler errors if this file
// is somehow encountered by Metro (Metro will never execute it, but it must
// not cause parse errors at analysis time).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as typeof import('path');
// The TypeScript compiler API — Node.js only, never bundled into the RN app.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ts = require('typescript') as typeof import('typescript');

// ─── Classification (identical rules to CodeIndexer.ts) ──────────────────────

/**
 * Classify a file by its name/path into a NodeType.
 * Rules are kept identical to the regex variant so the two outputs are
 * directly comparable.
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
 * Skips node_modules and dotfolders — identical to the regex walker.
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

// ─── AST helpers ─────────────────────────────────────────────────────────────

const HOOK_NAME_RE = /^use[A-Z]/;
const COMPONENT_NAME_RE = /^[A-Z]/;

/** True if a node carries the `export` modifier (named or default export). */
function isExported(node: import('typescript').Node): boolean {
  const modifiers = (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? [];
  return modifiers.some(
    (m) =>
      m.kind === ts.SyntaxKind.ExportKeyword ||
      m.kind === ts.SyntaxKind.DefaultKeyword,
  );
}

/**
 * Does the given function/arrow body contain any JSX? Used as a secondary
 * signal that an exported const/function is a component even if its name
 * does not start with a capital letter.
 */
function containsJsx(node: import('typescript').Node): boolean {
  let found = false;
  const visit = (n: import('typescript').Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * A detected top-level entity and how it was classified by the AST.
 */
interface DetectedEntity {
  name: string;
  kind: 'component' | 'hook' | 'class';
}

/**
 * Walk the top-level statements of a source file and detect exported
 * components, hooks and classes via the AST.
 */
function detectEntities(sourceFile: import('typescript').SourceFile): DetectedEntity[] {
  const entities: DetectedEntity[] = [];

  const addComponentOrHook = (
    name: string,
    hasJsx: boolean,
  ): void => {
    if (HOOK_NAME_RE.test(name)) {
      entities.push({ name, kind: 'hook' });
    } else if (COMPONENT_NAME_RE.test(name) || hasJsx) {
      entities.push({ name, kind: 'component' });
    }
  };

  for (const statement of sourceFile.statements) {
    // export function Foo() {} / export default function Foo() {}
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      addComponentOrHook(statement.name.text, containsJsx(statement));
      continue;
    }

    // export class FooService {} / export default class FooService {}
    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
      entities.push({ name: statement.name.text, kind: 'class' });
      continue;
    }

    // export const Foo = () => {...} / export const useFoo = function () {...}
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          continue;
        }
        const name = decl.name.text;
        const initializer = decl.initializer;
        const isFunctionLike =
          initializer !== undefined &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
        const hasJsx = isFunctionLike ? containsJsx(initializer) : false;
        // Only treat function-like consts, or capitalised/hook-named consts,
        // as entities (mirrors the regex variant which keyed off `const Name`).
        if (isFunctionLike || HOOK_NAME_RE.test(name) || COMPONENT_NAME_RE.test(name)) {
          addComponentOrHook(name, hasJsx);
        }
      }
    }
  }

  return entities;
}

/**
 * Resolve relative import dependency names from a source file's AST.
 * Keeps RELATIVE imports only (specifier starts with '.'), takes the basename,
 * and strips the same suffixes the regex variant strips. This keeps dependency
 * semantics identical so a direct comparison is fair.
 */
function extractImportNames(sourceFile: import('typescript').SourceFile): string[] {
  const names: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) {
      continue;
    }
    const importPath = specifier.text;
    if (!importPath.startsWith('.')) {
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

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Index all TypeScript/TSX files under projectRoot and produce a GraphNode[]
 * manifest ready for KnowledgeGraph.buildFromManifest().
 *
 * Same signature and output shape as CodeIndexer.indexProject(), but uses the
 * TypeScript AST for accurate declaration/import detection.
 *
 * @param projectRoot - Absolute or relative path to the app's source directory
 */
export async function indexProject(projectRoot: string): Promise<GraphNode[]> {
  const resolvedRoot = path.resolve(projectRoot);
  const files = walkDir(resolvedRoot);
  const nodes: GraphNode[] = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(projectRoot, filePath);
    const fileType = classifyFile(filePath);

    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const importedDeps = extractImportNames(sourceFile);
    const detected = detectEntities(sourceFile);

    let definedNames = detected.map((e) => e.name);

    if (definedNames.length === 0) {
      // Fall back to the file's base name — matches the regex variant.
      const fallback = path.basename(relativePath).replace(/\.(tsx?|jsx?)$/, '');
      definedNames = [fallback];
    }

    // Each top-level entity in the file gets its own node; they share deps,
    // exactly like the regex variant.
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
