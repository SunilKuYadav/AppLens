import { FileAccess, LineRange } from '../workspace/FileAccess';

/**
 * Read a workspace file for the model, delegating all boundary/size/binary
 * enforcement to {@link FileAccess.readFile}. Kept as a thin wrapper so the
 * agent loop dispatches to a uniform `tools/*` surface.
 *
 * @param access - The workspace boundary.
 * @param path   - Workspace-relative path to read.
 * @param range  - Optional 1-based inclusive line range.
 */
export function readFile(
  access: FileAccess,
  path: string,
  range?: LineRange,
): Promise<string> {
  return access.readFile(path, range);
}
