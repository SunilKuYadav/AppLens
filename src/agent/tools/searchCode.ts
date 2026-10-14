import * as path from 'node:path';
import { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { FileAccess, MAX_FILE_BYTES } from '../workspace/FileAccess';
import { GitignoreMatcher, isDenied } from '../workspace/ignoreRules';

/** A single matched line returned by {@link searchCode}. */
export interface SearchMatch {
  /** Workspace-relative file path (POSIX separators). */
  path: string;
  /** 1-based line number of the match. */
  line: number;
  /** The matching line's text (trimmed of trailing newline). */
  text: string;
}

/** Options for {@link searchCode}. */
export interface SearchCodeOptions {
  /**
   * A simple `*.ext` / substring glob restricting which files are searched.
   * `*` matches any run of non-separator chars; anything else is literal.
   */
  glob?: string;
  /** Hard cap on the number of matches returned (default 200). */
  maxMatches?: number;
}

/**
 * Ripgrep-style text search over the workspace: a Node `fs` walk plus a regex,
 * returning file + line + the matching line's text. No external `rg` binary is
 * assumed. Deny-listed and `.gitignore`'d paths, binary files, and files over
 * the size cap are skipped. All reads go through the realpath'd workspace root.
 *
 * @param access  - The workspace boundary.
 * @param query   - A regular expression (JS syntax) to match per line.
 * @param options - Optional glob filter and match cap.
 */
export async function searchCode(
  access: FileAccess,
  query: string,
  options: SearchCodeOptions = {},
): Promise<SearchMatch[]> {
  const maxMatches = options.maxMatches ?? 200;
  const gitignore = GitignoreMatcher.load(access.workspaceRoot);

  let regex: RegExp;
  try {
    regex = new RegExp(query);
  } catch (err) {
    throw new Error(
      `Invalid search pattern: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const globRe = options.glob ? compileGlob(options.glob) : null;
  const matches: SearchMatch[] = [];

  async function walk(relDir: string): Promise<void> {
    if (matches.length >= maxMatches) {
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

    for (const entry of entries) {
      if (matches.length >= maxMatches) {
        return;
      }
      const childRel = relDir === '.' ? entry.name : `${relDir}/${entry.name}`;
      if (isDenied(childRel) || gitignore.isIgnored(childRel)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(childRel);
      } else if (entry.isFile()) {
        if (globRe && !globRe.test(childRel)) {
          continue;
        }
        await scanFile(childRel);
      }
    }
  }

  async function scanFile(relFile: string): Promise<void> {
    const abs = path.join(access.workspaceRoot, relFile);
    try {
      const info = await stat(abs);
      if (info.size > MAX_FILE_BYTES) {
        return;
      }
      const buffer = await readFile(abs);
      if (buffer.includes(0)) {
        return; // binary
      }
      const lines = buffer.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxMatches) {
          return;
        }
        if (regex.test(lines[i])) {
          matches.push({ path: relFile, line: i + 1, text: lines[i].replace(/\r$/, '') });
        }
      }
    } catch {
      // Unreadable file — skip.
    }
  }

  await walk('.');
  return matches;
}

/** Compile a simple `*`-glob into a RegExp anchored to the full relative path. */
function compileGlob(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`(^|/)${escaped}$`);
}
