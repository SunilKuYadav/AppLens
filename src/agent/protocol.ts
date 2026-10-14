import { AIMessage, AIUsage } from '../types/AITypes';

/**
 * The WebSocket wire protocol between the device (AI tab) and the Node agent.
 *
 * One connection carries JSON messages, each tagged with a `type`. Request /
 * response correlation uses `id` (a question) or `callId` (a device-side tool
 * call). These TYPES are the only part of `src/agent` that FEAT-002 re-exports
 * from the RN barrel — nothing here imports Node or `ws`, so the device side
 * can share them safely.
 */

/** Names of the two tools that resolve on the DEVICE (from AppLensStorage). */
export type DeviceToolName = 'get_network_logs' | 'get_console_logs';

// ─── A. Device → agent ──────────────────────────────────────────────────────

/** A question from the device. `conversation` is the prior AIMessage history. */
export interface AskMessage {
  type: 'ask';
  /** Correlates the agent's streamed reply back to this question. */
  id: string;
  /** The developer's question text. */
  question: string;
  /** Prior conversation turns (user + assistant), oldest first. */
  conversation: AIMessage[];
}

// ─── B. Agent → device (streaming the answer) ────────────────────────────────

/** An incremental reply-text delta. */
export interface TokenMessage {
  type: 'token';
  /** The `id` of the originating {@link AskMessage}. */
  askId: string;
  /** Incremental reply text. */
  delta: string;
}

/** A proposed, suggest-only unified diff. Writes nothing on either side. */
export interface PatchMessage {
  type: 'patch';
  /** The `id` of the originating {@link AskMessage}. */
  askId: string;
  /** Workspace-relative path the diff applies to. */
  path: string;
  /** The unified-diff text. */
  diff: string;
  /** A short human-readable rationale for the change. */
  rationale: string;
}

/** The final reply for a question, with token usage for the exchange. */
export interface AnswerMessage {
  type: 'answer';
  /** The `id` of the originating {@link AskMessage}. */
  askId: string;
  /** The complete accumulated reply text. */
  text: string;
  /** Token usage reported/estimated for the exchange. */
  usage: AIUsage;
}

/** A terminal error for a question. */
export interface ErrorMessage {
  type: 'error';
  /** The `id` of the originating {@link AskMessage}. */
  askId: string;
  /** Human-readable error description. */
  message: string;
}

// ─── C. Agent → device tool call + its reply ─────────────────────────────────

/** The agent asking the device to run a runtime-log tool. */
export interface ToolCallMessage {
  type: 'tool_call';
  /** Correlates with the matching {@link ToolResultMessage}. */
  callId: string;
  /** Which device-side tool to run. */
  name: DeviceToolName;
  /** Tool arguments (e.g. a count/limit). Shape is tool-specific. */
  args: Record<string, unknown>;
}

/** The device's answer to a {@link ToolCallMessage}, from AppLensStorage. */
export interface ToolResultMessage {
  type: 'tool_result';
  /** The `callId` of the originating {@link ToolCallMessage}. */
  callId: string;
  /** The tool result payload (compact log summaries — see below). */
  result: unknown;
}

/** Any message the device may send to the agent. */
export type DeviceToAgentMessage = AskMessage | ToolResultMessage;

/** Any message the agent may send to the device. */
export type AgentToDeviceMessage =
  | TokenMessage
  | PatchMessage
  | AnswerMessage
  | ErrorMessage
  | ToolCallMessage;

/** Union of every protocol message (either direction). */
export type AgentMessage = DeviceToAgentMessage | AgentToDeviceMessage;

// ─── Device-side tool_result payload shapes ──────────────────────────────────

/** Compact network-log entry returned by `get_network_logs`. */
export interface NetworkLogSummary {
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  timestamp: number;
}

/** Compact console-log entry returned by `get_console_logs`. */
export interface ConsoleLogSummary {
  level: string;
  message: string;
  timestamp: number;
}

// ─── Pairing handshake (HTTP, one-shot) ──────────────────────────────────────

/** Body of `POST /pair`: who is pairing. */
export interface PairRequest {
  /** Free-form info about the connecting client (platform, app name, etc.). */
  clientInfo?: Record<string, unknown>;
}

/** Response to `POST /pair`: the single-session token and the WS URL to open. */
export interface PairResponse {
  /** Short-lived, single-session token to present on the WS upgrade. */
  token: string;
  /** The WebSocket URL to connect to (carries the token as a query param). */
  wsUrl: string;
}
