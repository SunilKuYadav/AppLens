import { FileAccess } from '../workspace/FileAccess';

/** The result of a {@link proposePatch} call. WRITES NOTHING. */
export interface ProposedPatch {
  /** Workspace-relative path the patch applies to. */
  path: string;
  /** A unified-diff string (git-style headers, @@ hunks). */
  diff: string;
  /** A short human-readable rationale for the change. */
  rationale: string;
}

/** Input to {@link proposePatch}. */
export interface ProposePatchInput {
  /** Workspace-relative target path. Validated through FileAccess. */
  path: string;
  /** The model's proposed full new content for the file. */
  newContent: string;
  /** A short rationale to surface alongside the diff. */
  rationale?: string;
}

/**
 * Produce a suggest-only unified diff for `path` from its current on-disk
 * content to `newContent`. This NEVER writes: it validates the target through
 * {@link FileAccess} (so a patch cannot name a file outside the workspace),
 * reads the current content, and returns the diff for the device to render.
 *
 * A missing target file is treated as an empty original (an add).
 *
 * @param access - The workspace boundary.
 * @param input  - Target path, proposed content, and rationale.
 */
export async function proposePatch(
  access: FileAccess,
  input: ProposePatchInput,
): Promise<ProposedPatch> {
  // Validate the path is inside the workspace. For a brand-new file the target
  // may not exist yet, so a resolve() ENOENT is tolerated — but a boundary
  // violation ("outside"/"absolute"/"ignored") is always re-thrown.
  let original = '';
  try {
    original = await access.readFile(input.path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/outside|absolute|ignored/i.test(message)) {
      throw err;
    }
    // Not found / not a file → treat as a new file (empty original).
    original = '';
  }

  const diff = unifiedDiff(input.path, original, input.newContent);
  return {
    path: input.path,
    diff,
    rationale: input.rationale ?? '',
  };
}

/**
 * Build a minimal unified diff between `original` and `updated` for `filePath`.
 * This is a self-contained line-based diff (no external dependency): it emits
 * one hunk spanning the full file. It is intended for display, not for machine
 * application (apply_patch is explicitly out of scope for M1).
 */
export function unifiedDiff(
  filePath: string,
  original: string,
  updated: string,
): string {
  const a = splitKeepLines(original);
  const b = splitKeepLines(updated);

  const header =
    `--- a/${filePath}\n` +
    `+++ b/${filePath}\n` +
    `@@ -1,${a.length} +1,${b.length} @@\n`;

  const body = [
    ...a.map((line) => `-${line}`),
    ...b.map((line) => `+${line}`),
  ].join('');

  return header + body;
}

/**
 * Split text into lines each ending in '\n' so the diff body reproduces the
 * content faithfully. A trailing partial line (no newline) is kept as-is.
 */
function splitKeepLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split('\n');
  // A trailing '\n' produces a final empty element — drop it.
  if (lines[lines.length - 1] === '') {
    lines.pop();
    return lines.map((l) => `${l}\n`);
  }
  return lines.map((l, i) => (i === lines.length - 1 ? l : `${l}\n`));
}
