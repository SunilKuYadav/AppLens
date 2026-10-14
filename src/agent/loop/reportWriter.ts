import * as path from 'node:path';
import { appendFile } from 'node:fs/promises';

/** The report file name, written to the TARGET project root. */
export const REPORT_FILE = 'applens-agent-report.md';

/** A tool invocation recorded in the run report. */
export interface ReportToolCall {
  /** Tool name (e.g. 'read_file', 'get_console_logs'). */
  name: string;
  /** Arguments the tool was called with. */
  args: unknown;
}

/** A proposed diff recorded in the run report. */
export interface ReportPatch {
  path: string;
  rationale: string;
}

/** Everything worth auditing about one answered question. */
export interface RunReportEntry {
  /** The developer's question. */
  question: string;
  /** Tools the agent called, in order, with their args. */
  toolCalls: ReportToolCall[];
  /** Workspace-relative files the agent read. */
  filesRead: string[];
  /** Proposed diffs emitted for this question. */
  patches: ReportPatch[];
  /** The final answer text. */
  answer: string;
  /** The parsed confidence line, if the model emitted one. */
  confidence?: string;
}

/**
 * Append one answered-question entry to `applens-agent-report.md` in the target
 * project root. This is the agent's OWN report and the ONLY file the agent ever
 * writes — it is never project source, so it stays within M1's "no writes to
 * project files" rule. Pure append.
 *
 * @param projectRoot - The target project root (the agent's workspace).
 * @param entry       - The audit record for one question.
 */
export async function appendRunReport(
  projectRoot: string,
  entry: RunReportEntry,
): Promise<void> {
  const file = path.join(projectRoot, REPORT_FILE);
  await appendFile(file, renderEntry(entry), 'utf8');
}

/** Render a single report entry as a Markdown section. */
function renderEntry(entry: RunReportEntry): string {
  const ts = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`\n## ${ts}`);
  lines.push('');
  lines.push(`**Question:** ${entry.question}`);
  lines.push('');

  if (entry.toolCalls.length > 0) {
    lines.push('**Tools called:**');
    for (const call of entry.toolCalls) {
      lines.push(`- \`${call.name}\` ${safeJson(call.args)}`);
    }
    lines.push('');
  }

  if (entry.filesRead.length > 0) {
    lines.push('**Files read:**');
    for (const f of entry.filesRead) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (entry.patches.length > 0) {
    lines.push('**Proposed diffs:**');
    for (const p of entry.patches) {
      lines.push(`- \`${p.path}\` — ${p.rationale}`);
    }
    lines.push('');
  }

  lines.push('**Answer:**');
  lines.push('');
  lines.push(entry.answer.trim());
  if (entry.confidence) {
    lines.push('');
    lines.push(`_${entry.confidence}_`);
  }
  lines.push('');
  return lines.join('\n');
}

/** JSON.stringify that never throws (circular/odd values → a placeholder). */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
