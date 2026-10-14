import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Hard deny-list applied to every workspace-relative path before the agent
 * reads or lists it. These cover dependency/VCS noise and secret-ish files so
 * credentials never reach the model, independent of any `.gitignore`.
 *
 * Each entry is tested against BOTH the full relative path and its individual
 * segments, so e.g. `node_modules` matches `node_modules/x` and `a/node_modules/x`.
 */
const DENY_SEGMENTS: ReadonlyArray<RegExp> = [
  /^node_modules$/,
  /^\.git$/,
  /^\.env(\..+)?$/, // .env, .env.local, .env.production, ...
  /.*\.pem$/,
  /.*\.keystore$/,
  /.*\.jks$/,
  /^id_rsa.*$/, // id_rsa, id_rsa.pub, ...
];

/**
 * Returns true if `relativePath` (workspace-relative, POSIX or OS separators)
 * should be hidden from the agent by the hard deny-list.
 */
export function isDenied(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  return segments.some((segment) =>
    DENY_SEGMENTS.some((rule) => rule.test(segment)),
  );
}

/**
 * A lightweight `.gitignore` matcher. We only need the common cases cheaply:
 * exact names, directory names, and simple `*.ext` globs. Patterns are matched
 * against path segments (and the whole relative path) — this is intentionally
 * conservative (it may fail to ignore an exotic pattern) rather than wrong (it
 * never ignores something a pattern did not name).
 */
export class GitignoreMatcher {
  private readonly patterns: RegExp[];

  private constructor(patterns: RegExp[]) {
    this.patterns = patterns;
  }

  /** Build a matcher from the `.gitignore` at the workspace root, if present. */
  static load(workspaceRoot: string): GitignoreMatcher {
    const file = path.join(workspaceRoot, '.gitignore');
    let raw = '';
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return new GitignoreMatcher([]);
    }

    const patterns: RegExp[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      // Skip blanks, comments, and negations (negation is beyond "cheap").
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
        continue;
      }
      const compiled = GitignoreMatcher.compile(trimmed);
      if (compiled) {
        patterns.push(compiled);
      }
    }
    return new GitignoreMatcher(patterns);
  }

  /** True if the workspace-relative path matches any loaded gitignore pattern. */
  isIgnored(relativePath: string): boolean {
    const normalized = relativePath.split(path.sep).join('/');
    const segments = normalized.split('/').filter(Boolean);
    return this.patterns.some(
      (re) => re.test(normalized) || segments.some((s) => re.test(s)),
    );
  }

  /** Translate a simple gitignore pattern into an anchored RegExp, or null. */
  private static compile(pattern: string): RegExp | null {
    // Strip a trailing slash (directory marker) and a leading slash (anchor).
    let p = pattern.replace(/\/+$/, '').replace(/^\/+/, '');
    if (!p) {
      return null;
    }
    // Escape regex metachars except '*', then map '*' to a non-slash wildcard.
    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
    try {
      return new RegExp(`^${escaped}$`);
    } catch {
      return null;
    }
  }
}

/**
 * Convenience check used by {@link FileAccess}. Only the hard deny-list is
 * consulted here (it needs no workspace root); `.gitignore` filtering is
 * applied by the listing/search tools via {@link GitignoreMatcher}, which is
 * where a root is available cheaply.
 */
export function isIgnored(relativePath: string): boolean {
  return isDenied(relativePath);
}
