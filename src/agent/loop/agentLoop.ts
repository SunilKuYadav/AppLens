import { AIProvider } from '../../ai/AIProvider';
import { AIMessage, AIUsage, ContextChunk } from '../../types/AITypes';
import { FileAccess } from '../workspace/FileAccess';
import { listFiles } from '../tools/listFiles';
import { searchCode } from '../tools/searchCode';
import { readFile as readWorkspaceFile } from '../tools/readFile';
import { proposePatch, ProposedPatch } from '../tools/proposePatch';
import {
  DeviceBridge,
  getConsoleLogs,
  getNetworkLogs,
} from '../tools/runtimeLogTools';
import {
  appendRunReport,
  ReportPatch,
  ReportToolCall,
} from './reportWriter';

/** Hard cap on tool rounds per question — prevents runaway loops. */
export const MAX_TOOL_ROUNDS = 8;

/** Callbacks the server wires to the WS so the loop can stream out. */
export interface AgentLoopCallbacks {
  /** Called with each incremental reply-text delta. */
  onToken: (delta: string) => void;
  /** Called when the model proposes a (suggest-only) patch. */
  onPatch: (patch: ProposedPatch) => void;
}

/** Dependencies the loop runs against. */
export interface AgentLoopDeps {
  /** The AI backend (createAIProvider(config)). */
  provider: AIProvider;
  /** The workspace boundary for file tools. */
  access: FileAccess;
  /** The device bridge for runtime-log tools. */
  bridge: DeviceBridge;
  /** Target project root (where the run report is appended). */
  projectRoot: string;
}

/** The outcome of answering one question. */
export interface AgentLoopResult {
  /** The final reply text. */
  text: string;
  /** Token usage for the exchange. */
  usage: AIUsage;
}

/**
 * The six tools the model may call, described for the system prompt. The loop
 * parses a STRICT JSON tool-call from the model, runs it, feeds the result
 * back, and repeats up to {@link MAX_TOOL_ROUNDS} rounds before forcing a final
 * answer. The provider has no native function-calling, hence the prompt-driven
 * JSON protocol.
 */
const TOOL_PROTOCOL = [
  'You are AppLens Agent — an expert React Native assistant with READ-ONLY access',
  'to the developer\'s project and the running app\'s runtime logs. You cannot write',
  'files or run commands. You may propose a patch (a diff) but it is only a suggestion.',
  '',
  'You work in rounds. In each round you may EITHER call one tool OR give the final answer.',
  'To call a tool, reply with ONLY a single JSON object on one line, no prose, no code fence:',
  '  {"tool":"<name>","args":{...}}',
  'The six tools are:',
  '  - list_files        args: { "dir"?: string }                 → project file tree',
  '  - search_code       args: { "query": string, "glob"?: string } → regex matches (file+line)',
  '  - read_file         args: { "path": string, "start"?: number, "end"?: number } → file text',
  '  - get_network_logs  args: { "count"?: number }               → recent network requests',
  '  - get_console_logs  args: { "count"?: number }               → recent console logs',
  '  - propose_patch     args: { "path": string, "newContent": string, "rationale"?: string } → a suggested diff',
  '',
  'After a tool call you will receive a message beginning "TOOL_RESULT" with the JSON result.',
  'Use it to decide the next round. When you have enough information, STOP calling tools and',
  'write the final answer as normal prose (NOT JSON).',
  'End the final answer with a line formatted EXACTLY as one of:',
  '"Confidence: High", "Confidence: Medium", or "Confidence: Low".',
].join('\n');

/** A parsed tool call extracted from a model turn. */
interface ParsedToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Run the prompt-driven tool-calling loop for a single question. Streams reply
 * tokens via `callbacks.onToken`, emits `callbacks.onPatch` on propose_patch,
 * appends a run-report entry, and returns the final text + usage.
 */
export async function runAgentLoop(
  deps: AgentLoopDeps,
  question: string,
  conversation: AIMessage[],
  callbacks: AgentLoopCallbacks,
): Promise<AgentLoopResult> {
  const { provider, access, bridge, projectRoot } = deps;

  // The running message list the loop sends to the provider each round. The
  // tool protocol is injected as a leading system message; the prior
  // conversation and the new question follow.
  const messages: AIMessage[] = [
    makeMessage('system', TOOL_PROTOCOL),
    ...conversation,
    makeMessage('user', question),
  ];

  const context: ContextChunk[] = [];
  const toolCalls: ReportToolCall[] = [];
  const filesRead: string[] = [];
  const patches: ReportPatch[] = [];

  let finalText = '';
  let lastUsage: AIUsage | undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last allowed round, instruct the model to stop calling tools.
    if (round === MAX_TOOL_ROUNDS) {
      messages.push(
        makeMessage(
          'system',
          'Tool-round limit reached. Do NOT call any more tools. Write the final answer now.',
        ),
      );
    }

    // Buffer this turn; only stream to the device once we know it is the final
    // (prose) answer, not a tool-call JSON turn.
    let turnText = '';
    const result = await provider.chatStream(messages, context, (delta) => {
      turnText += delta;
    });
    lastUsage = result.usage;
    const turn = result.text.trim();

    const toolCall = parseToolCall(turn);
    const isLastRound = round === MAX_TOOL_ROUNDS;

    if (!toolCall || isLastRound) {
      // Final answer. Stream it out as token(s) and finish.
      finalText = result.text;
      callbacks.onToken(result.text);
      break;
    }

    // Record and execute the tool call, then feed the result back.
    messages.push(makeMessage('assistant', turn));
    toolCalls.push({ name: toolCall.tool, args: toolCall.args });

    const toolResult = await executeTool(toolCall, {
      access,
      bridge,
      onPatch: (patch) => {
        callbacks.onPatch(patch);
        patches.push({ path: patch.path, rationale: patch.rationale });
      },
      onFileRead: (p) => filesRead.push(p),
    });

    messages.push(
      makeMessage('user', `TOOL_RESULT ${safeStringify(toolResult)}`),
    );
  }

  const usage: AIUsage =
    lastUsage ?? {
      contextTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimated: true,
    };

  await appendRunReport(projectRoot, {
    question,
    toolCalls,
    filesRead,
    patches,
    answer: finalText,
    confidence: parseConfidence(finalText),
  });

  return { text: finalText, usage };
}

/** Context passed to {@link executeTool}. */
interface ExecuteToolCtx {
  access: FileAccess;
  bridge: DeviceBridge;
  onPatch: (patch: ProposedPatch) => void;
  onFileRead: (path: string) => void;
}

/** Dispatch one parsed tool call to its executor and return a JSON-able result. */
async function executeTool(
  call: ParsedToolCall,
  ctx: ExecuteToolCtx,
): Promise<unknown> {
  const { args } = call;
  try {
    switch (call.tool) {
      case 'list_files':
        return await listFiles(ctx.access, asString(args.dir));
      case 'search_code': {
        const query = asString(args.query);
        if (!query) {
          return { error: 'search_code requires a "query" string' };
        }
        return await searchCode(ctx.access, query, { glob: asString(args.glob) });
      }
      case 'read_file': {
        const p = asString(args.path);
        if (!p) {
          return { error: 'read_file requires a "path" string' };
        }
        const start = asNumber(args.start);
        const end = asNumber(args.end);
        const range =
          start !== undefined && end !== undefined ? { start, end } : undefined;
        const text = await readWorkspaceFile(ctx.access, p, range);
        ctx.onFileRead(p);
        return { path: p, text };
      }
      case 'get_network_logs':
        return await getNetworkLogs(ctx.bridge, asNumber(args.count));
      case 'get_console_logs':
        return await getConsoleLogs(ctx.bridge, asNumber(args.count));
      case 'propose_patch': {
        const p = asString(args.path);
        if (!p) {
          return { error: 'propose_patch requires a "path" string' };
        }
        const patch = await proposePatch(ctx.access, {
          path: p,
          newContent: asString(args.newContent) ?? '',
          rationale: asString(args.rationale),
        });
        ctx.onPatch(patch);
        return { path: patch.path, rationale: patch.rationale, emitted: true };
      }
      default:
        return { error: `Unknown tool: ${call.tool}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Parse a model turn as a tool call, tolerating a surrounding ```json fence or
 * leading/trailing prose around a single JSON object. Returns null if the turn
 * is not a recognizable `{tool, args}` object (i.e. it is a final answer).
 */
export function parseToolCall(turn: string): ParsedToolCall | null {
  const json = extractJsonObject(turn);
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const tool = parsed.tool;
    if (typeof tool !== 'string') {
      return null;
    }
    const args =
      parsed.args && typeof parsed.args === 'object'
        ? (parsed.args as Record<string, unknown>)
        : {};
    return { tool, args };
  } catch {
    return null;
  }
}

/** Pull the first balanced top-level JSON object out of a string, if any. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** Extract the trailing "Confidence: ..." line, if present. */
function parseConfidence(text: string): string | undefined {
  const match = /Confidence:\s*(High|Medium|Low)/i.exec(text);
  return match ? `Confidence: ${match[1]}` : undefined;
}

/** Build an AIMessage with a generated id + timestamp. */
function makeMessage(role: AIMessage['role'], content: string): AIMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** JSON.stringify that never throws and caps huge payloads for the prompt. */
function safeStringify(value: unknown): string {
  let out: string;
  try {
    out = JSON.stringify(value);
  } catch {
    out = '"[unserializable]"';
  }
  const CAP = 12_000;
  return out.length > CAP ? `${out.slice(0, CAP)}…(truncated)` : out;
}
