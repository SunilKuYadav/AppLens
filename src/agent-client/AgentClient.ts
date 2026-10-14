import type {
  AIMessage,
  AIUsage,
} from '../types/AITypes';
import type {
  AgentToDeviceMessage,
  AskMessage,
  ConsoleLogSummary,
  DeviceToAgentMessage,
  NetworkLogSummary,
  PairRequest,
  PairResponse,
  PatchMessage,
  ToolCallMessage,
  ToolResultMessage,
} from '../agent/protocol';
import type { AppLensStorage } from '../storage/AppLensStorage';

/**
 * Callbacks invoked while an {@link AgentClient.ask} request is in flight.
 */
export interface AskHandlers {
  /** Called for each incremental reply-text delta streamed from the agent. */
  onToken?: (delta: string) => void;
  /** Called for each proposed, suggest-only unified diff from the agent. */
  onPatch?: (patch: PatchMessage) => void;
}

/** The resolved value of a completed {@link AgentClient.ask}. */
export interface AskResult {
  /** The complete accumulated reply text. */
  text: string;
  /** Token usage reported/estimated for the exchange. */
  usage: AIUsage;
}

/** Default cap on how many log entries a device-side tool returns. */
const DEFAULT_LOG_COUNT = 50;
/** Hard upper bound on returned log entries, mirroring the agent-side cap. */
const MAX_LOG_COUNT = 200;

/**
 * The RN-safe device half of the Agent Mode channel.
 *
 * `AgentClient` lives in the React Native bundle, so it imports NOTHING
 * Node-only: it uses the RN global `WebSocket` and only TYPE imports from
 * `src/agent/protocol`. Its job is to:
 *
 *  1. pair with a locally running `applens-agent` over `POST /pair`,
 *  2. open the returned WebSocket URL (presenting the single-session token),
 *  3. forward the developer's questions as `ask` messages and surface the
 *     streamed `token` / `patch` / `answer` replies, and
 *  4. answer inbound `tool_call`s for the two runtime-log tools from the
 *     device's {@link AppLensStorage} (values are already redacted at capture).
 *
 * File tools (`list_files`, `search_code`, `read_file`, `propose_patch`)
 * resolve entirely on the agent and never reach the device.
 */
export class AgentClient {
  private readonly baseURL: string;
  private readonly getStorage: () => AppLensStorage;

  private ws: WebSocket | null = null;
  private token: string | null = null;

  /** In-flight `ask` request, keyed by its `id`. Only one at a time in M1. */
  private pending: {
    askId: string;
    handlers: AskHandlers;
    text: string;
    resolve: (result: AskResult) => void;
    reject: (err: Error) => void;
  } | null = null;

  /**
   * @param baseURL   The agent base URL (e.g. `http://127.0.0.1:4747`), already
   *                  adjusted for the current platform's addressing rules.
   * @param getStorage A getter for the device's storage, used to answer the
   *                  runtime-log tool calls. Deferred (not the instance) so the
   *                  client always reads the live buffers.
   */
  constructor(baseURL: string, getStorage: () => AppLensStorage) {
    // Normalize away a trailing slash so URL joins are predictable.
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.getStorage = getStorage;
  }

  /**
   * Perform the one-shot pairing handshake: `POST /pair` → `{ token, wsUrl }`.
   * Stores the token for the subsequent {@link connect} and returns the pair
   * response so callers can inspect the `wsUrl`.
   */
  async pair(clientInfo?: PairRequest['clientInfo']): Promise<PairResponse> {
    const body: PairRequest = { clientInfo };
    const res = await fetch(`${this.baseURL}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Agent pairing failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as PairResponse;
    if (!data || typeof data.token !== 'string' || typeof data.wsUrl !== 'string') {
      throw new Error('Agent pairing returned an invalid response.');
    }
    this.token = data.token;
    return data;
  }

  /**
   * Open the WebSocket to the agent. Must be called after {@link pair}; it
   * opens the `wsUrl` returned by pairing verbatim (the token is already a
   * query param on that URL). Resolves once the socket is open.
   */
  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        settled = true;
        resolve();
      };
      ws.onmessage = (event: WebSocketMessageEvent) => {
        this.handleMessage(event.data);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Failed to connect to the AppLens agent.'));
        }
      };
      ws.onclose = () => {
        // If a request was in flight when the socket dropped, fail it.
        if (this.pending) {
          const { reject: rejectPending } = this.pending;
          this.pending = null;
          rejectPending(new Error('Agent connection closed before the reply completed.'));
        }
        if (this.ws === ws) {
          this.ws = null;
        }
      };
    });
  }

  /** True when the WebSocket is open and ready to carry a question. */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1; // WebSocket.OPEN
  }

  /**
   * Ask the agent a question. Sends an `ask` message and resolves with the
   * final answer once the agent emits its `answer`. `onToken` fires for each
   * streamed `token` delta; `onPatch` fires for each proposed `patch`.
   *
   * M1 supports a single in-flight request at a time.
   */
  ask(
    question: string,
    conversation: AIMessage[],
    handlers: AskHandlers = {},
  ): Promise<AskResult> {
    if (!this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new Error('Agent is not connected.'));
    }
    if (this.pending) {
      return Promise.reject(new Error('An agent request is already in flight.'));
    }

    const askId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const message: AskMessage = {
      type: 'ask',
      id: askId,
      question,
      conversation,
    };

    return new Promise<AskResult>((resolve, reject) => {
      this.pending = { askId, handlers, text: '', resolve, reject };
      this.send(message);
    });
  }

  /** Close the WebSocket, if open. */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private send(message: DeviceToAgentMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  /** Parse and dispatch an inbound agent → device message. */
  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }
    let message: AgentToDeviceMessage;
    try {
      message = JSON.parse(raw) as AgentToDeviceMessage;
    } catch {
      return; // Ignore unparseable frames.
    }

    switch (message.type) {
      case 'token':
        this.onTokenMessage(message.askId, message.delta);
        break;
      case 'patch':
        this.onPatchMessage(message);
        break;
      case 'answer':
        this.onAnswerMessage(message.askId, message.text, message.usage);
        break;
      case 'error':
        this.onErrorMessage(message.askId, message.message);
        break;
      case 'tool_call':
        this.onToolCall(message);
        break;
      default:
        // Unknown message type — ignore for forward compatibility.
        break;
    }
  }

  private onTokenMessage(askId: string, delta: string): void {
    if (!this.pending || this.pending.askId !== askId) {
      return;
    }
    this.pending.text += delta;
    this.pending.handlers.onToken?.(delta);
  }

  private onPatchMessage(message: PatchMessage): void {
    if (!this.pending || this.pending.askId !== message.askId) {
      return;
    }
    this.pending.handlers.onPatch?.(message);
  }

  private onAnswerMessage(askId: string, text: string, usage: AIUsage): void {
    if (!this.pending || this.pending.askId !== askId) {
      return;
    }
    const { resolve } = this.pending;
    this.pending = null;
    resolve({ text, usage });
  }

  private onErrorMessage(askId: string, errorMessage: string): void {
    if (!this.pending || this.pending.askId !== askId) {
      return;
    }
    const { reject } = this.pending;
    this.pending = null;
    reject(new Error(errorMessage));
  }

  /**
   * Answer an inbound device-side tool call from {@link AppLensStorage},
   * echoing the originating `callId`. The two runtime-log tools resolve here;
   * all other tools never reach the device.
   */
  private onToolCall(message: ToolCallMessage): void {
    const count = this.resolveCount(message.args);
    let result: unknown;

    switch (message.name) {
      case 'get_network_logs':
        result = this.getNetworkSummaries(count);
        break;
      case 'get_console_logs':
        result = this.getConsoleSummaries(count);
        break;
      default:
        // Unknown tool — return an empty result rather than hanging the agent.
        result = [];
        break;
    }

    const reply: ToolResultMessage = {
      type: 'tool_result',
      callId: message.callId,
      result,
    };
    this.send(reply);
  }

  /** Clamp the requested count into `[1, MAX_LOG_COUNT]`, defaulting sensibly. */
  private resolveCount(args: Record<string, unknown>): number {
    const raw = args?.count;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return DEFAULT_LOG_COUNT;
    }
    return Math.max(1, Math.min(MAX_LOG_COUNT, Math.floor(raw)));
  }

  /**
   * Map the most-recent `count` network requests to compact summaries. Storage
   * returns oldest-first, so take the tail and keep newest-last ordering.
   */
  private getNetworkSummaries(count: number): NetworkLogSummary[] {
    const requests = this.getStorage().getNetworkRequests();
    const recent = requests.slice(-count);
    return recent.map((r) => ({
      method: r.method,
      url: r.url,
      status: r.status,
      durationMs: r.duration,
      timestamp: r.timestamp,
    }));
  }

  /** Map the most-recent `count` console logs to compact summaries. */
  private getConsoleSummaries(count: number): ConsoleLogSummary[] {
    const logs = this.getStorage().getLogs();
    const recent = logs.slice(-count);
    return recent.map((l) => ({
      level: l.level,
      message: l.message,
      timestamp: l.timestamp,
    }));
  }
}
