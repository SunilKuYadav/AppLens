import * as path from 'node:path';
import { realpath, readFile, stat } from 'node:fs/promises';
import { isIgnored } from './ignoreRules';

/**
 * Maximum size (bytes) of a file the agent is willing to read into a model
 * prompt. Larger files are rejected rather than silently truncated so the
 * model never reasons over a partial file without knowing it.
 */
export const MAX_FILE_BYTES = 100 * 1024; // 100 KB

/** An optional 1-based, inclusive line range for a partial read. */
export interface LineRange {
  /** First line to include (1-based, inclusive). */
  start: number;
  /** Last line to include (1-based, inclusive). */
  end: number;
}

/**
 * The workspace boundary for the agent. Every filesystem path the model can
 * reach is funnelled through here first.
 *
 * The boundary is enforced in two layers so neither a `..` traversal nor a
 * symlink can escape the authorized project root:
 *   1. `path.resolve` against the realpath'd root, then reject the result if
 *      `path.relative(root, target)` escapes (starts with `..` or is absolute).
 *   2. `realpath` the resolved target and re-check it is STILL inside the real
 *      root — this defeats a symlink inside the workspace that points outside.
 *
 * Pure Node — no `ws`, no model imports — so it is unit-testable in isolation.
 */
export class FileAccess {
  /** The realpath'd, absolute workspace root. Populated by {@link create}. */
  private readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  /**
   * Create a FileAccess bound to `workspaceRoot`. The root is realpath'd up
   * front so every later check compares against the canonical path (a root
   * that is itself a symlink does not later look like an escape).
   *
   * @throws if the root does not exist or is not a directory.
   */
  static async create(workspaceRoot: string): Promise<FileAccess> {
    const root = await realpath(workspaceRoot);
    const info = await stat(root);
    if (!info.isDirectory()) {
      throw new Error(`Workspace root is not a directory: ${workspaceRoot}`);
    }
    return new FileAccess(root);
  }

  /** The canonical (realpath'd) absolute workspace root. */
  get workspaceRoot(): string {
    return this.root;
  }

  /**
   * Resolve a workspace-relative path to a safe absolute path, or throw if it
   * escapes the workspace. Absolute inputs and `..` escapes are rejected before
   * any filesystem access; the symlink re-check runs only if the target exists.
   *
   * @param relativePath - A path relative to the workspace root.
   * @returns The canonical absolute path, guaranteed inside the workspace.
   */
  async resolve(relativePath: string): Promise<string> {
    if (path.isAbsolute(relativePath)) {
      throw new Error('Access denied: absolute paths are not allowed');
    }

    const target = path.resolve(this.root, relativePath);
    const relative = path.relative(this.root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path is outside the workspace');
    }

    // Deny-list / ignore rules apply to the workspace-relative form.
    if (isIgnored(relative)) {
      throw new Error(`Access denied: path is ignored (${relative})`);
    }

    // Resolve symlinks before use to prevent a symlink inside the workspace
    // from pointing outside it. Non-existent targets realpath-throw ENOENT;
    // let that propagate so callers get a real "not found" error.
    const resolvedTarget = await realpath(target);
    const resolvedRelative = path.relative(this.root, resolvedTarget);
    if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
      throw new Error('Access denied: file resolves outside the workspace');
    }

    return resolvedTarget;
  }

  /**
   * Read a UTF-8 text file inside the workspace. Enforces the 100 KB size cap
   * and a binary sniff (reject NUL bytes / invalid UTF-8) so the model is only
   * ever fed decodable source text.
   *
   * @param relativePath - Workspace-relative path to read.
   * @param range        - Optional 1-based inclusive line range to slice out.
   * @returns The file text (or the requested line slice).
   */
  async readFile(relativePath: string, range?: LineRange): Promise<string> {
    const abs = await this.resolve(relativePath);

    const info = await stat(abs);
    if (!info.isFile()) {
      throw new Error(`Not a file: ${relativePath}`);
    }
    if (info.size > MAX_FILE_BYTES) {
      throw new Error(
        `File too large: ${relativePath} is ${info.size} bytes (cap ${MAX_FILE_BYTES}).`,
      );
    }

    const buffer = await readFile(abs);
    if (FileAccess.looksBinary(buffer)) {
      throw new Error(`Refusing to read binary file: ${relativePath}`);
    }

    const text = buffer.toString('utf8');

    if (!range) {
      return text;
    }

    const lines = text.split('\n');
    const start = Math.max(1, range.start);
    const end = Math.min(lines.length, range.end);
    if (end < start) {
      return '';
    }
    return lines.slice(start - 1, end).join('\n');
  }

  /**
   * Heuristic binary sniff: a NUL byte anywhere, or a byte sequence that is not
   * valid UTF-8, marks the content as binary. Only the first 8 KB is inspected
   * which is enough to classify source files reliably.
   */
  private static looksBinary(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8 * 1024));
    if (sample.includes(0)) {
      return true;
    }
    // Validate the sample is well-formed UTF-8. A fatal TextDecoder throws on
    // invalid byte sequences; treat that as "binary".
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample);
      return false;
    } catch {
      return true;
    }
  }
}
