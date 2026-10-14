import * as path from 'node:path';
import { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { FileAccess } from '../workspace/FileAccess';
import { GitignoreMatcher, isDenied } from '../workspace/ignoreRules';

/** A single entry in a {@link listFiles} tree. */
export interface FileTreeEntry {
  /** Workspace-relative path (POSIX separators). */
  path: string;
  /** Whether this entry is a directory. */
  isDir: boolean;
}

/** Options for {@link listFiles}. */
export interface ListFilesOptions {
  /** Maximum directory depth to descend (default 3). */
  maxDepth?: number;
  /** Hard cap on the number of entries returned (default 500). */
  maxEntries?: number;
}

/**
 * List files and directories under `dir` (workspace-relative, default root) as
 * a depth-limited, ignore-filtered flat tree. Deny-listed and `.gitignore`'d
 * paths are skipped. Every path is validated through {@link FileAccess} so a
 * caller cannot list outside the workspace.
 *
 * @param access - The workspace boundary.
 * @param dir    - Workspace-relative start directory ('' or undefined = root).
 * @param options - Depth/entry caps.
 */
export async function listFiles(
  access: FileAccess,
  dir?: string,
  options: ListFilesOptions = {},
): Promise<FileTreeEntry[]> {
  const maxDepth = options.maxDepth ?? 3;
  const maxEntries = options.maxEntries ?? 500;
  const gitignore = GitignoreMatcher.load(access.workspaceRoot);

  const startRel = dir && dir.length > 0 ? dir : '.';
  // Validate the start directory is inside the workspace (root resolves to '.').
  if (startRel !== '.') {
    await access.resolve(startRel);
  }

  const results: FileTreeEntry[] = [];

  async function walk(relDir: string, depth: number): Promise<void> {
    if (results.length >= maxEntries || depth > maxDepth) {
      return;
    }

    const absDir =
      relDir === '.' ? access.workspaceRoot : path.join(access.workspaceRoot, relDir);

    let entries: Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (results.length >= maxEntries) {
        return;
      }
      const childRel = relDir === '.' ? entry.name : `${relDir}/${entry.name}`;
      if (isDenied(childRel) || gitignore.isIgnored(childRel)) {
        continue;
      }
      const isDir = entry.isDirectory();
      results.push({ path: childRel, isDir });
      if (isDir && depth < maxDepth) {
        await walk(childRel, depth + 1);
      }
    }
  }

  await walk(startRel === '.' ? '.' : startRel, 1);
  return results;
}
