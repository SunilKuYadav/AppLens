import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { URL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { AppLensConfig } from '../core/AppLensConfig';
import { createAIProvider } from '../ai/AIProvider';
import { FileAccess } from './workspace/FileAccess';
import { DeviceBridge } from './tools/runtimeLogTools';
import { runAgentLoop } from './loop/agentLoop';
import { ProposedPatch } from './tools/proposePatch';
import {
  AgentToDeviceMessage,
  AskMessage,
  DeviceToAgentMessage,
  DeviceToolName,
  PairResponse,
} from './protocol';

/** Options for {@link startAgentServer}. */
export interface AgentServerOptions {
  /** The realpath'd project root (the agent's workspace). */
  projectRoot: string;
  /** Port to listen on. */
  port: number;
  /** Host/interface to bind. Default caller passes 127.0.0.1. */
  host: string;
  /** Optional fixed pairing token (dev convenience); minted if omitted. */
  token?: string;
  /** AppLens config used to build the AIProvider for the loop. */
  config: AppLensConfig;
}

/** A running agent server handle. */
export interface AgentServer {
  /** The resolved listen URL (e.g. http://127.0.0.1:4747). */
  url: string;
  /** The active single-session pairing token. */
  token: string;
  /** Stop the server and close any socket. */
  close: () => Promise<void>;
}

/** How long a minted pairing token stays valid before first use (ms). */
const TOKEN_TTL_MS = 5 * 60 * 1000;

/** How long to wait for a device tool_result before rejecting (ms). */
const TOOL_TIMEOUT_MS = 15_000;

/**
 * Start the agent's HTTP + WebSocket server.
 *
 * - `POST /pair` mints (or reuses the fixed) short-lived, single-session token
 *   and returns `{ token, wsUrl }`.
 * - The WS upgrade validates the token (passed as the `token` query param) and
 *   rejects anything else with a 401.
 * - One accepted socket = one session = one loop instance bound to that socket.
 *   The device both asks questions and answers the two runtime-log tool calls.
 *
 * Binds whatever `host` the caller passes (the CLI defaults it to 127.0.0.1).
 */
export function startAgentServer(options: AgentServerOptions): Promise<AgentServer> {
  const { projectRoot, port, host, config } = options;

  // The single-session token. A fixed --token is always valid; a minted token
  // expires if a device never pairs.
  let token = options.token ?? mintToken();
  let tokenExpiresAt = options.token ? Infinity : Date.now() + TOKEN_TTL_MS;
  const fixedToken = options.token !== undefined;

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url && req.url.split('?')[0] === '/pair') {
      handlePair(req, res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });

  const wss = new WebSocketServer({ noServer: true });

  function handlePair(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Drain (and ignore the shape of) the body; clientInfo is advisory in M1.
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      // Re-mint on each pair unless a fixed token was provided.
      if (!fixedToken) {
        token = mintToken();
        tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
      }
      const wsUrl = `ws://${hostForUrl(host)}:${port}/?token=${encodeURIComponent(token)}`;
      const payload: PairResponse = { token, wsUrl };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  }

  httpServer.on('upgrade', (req, socket, head) => {
    const ok = validateUpgradeToken(req);
    if (!ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  /** Validate the `token` query param against the active token (+ TTL). */
  function validateUpgradeToken(req: http.IncomingMessage): boolean {
    try {
      const url = new URL(req.url ?? '', `http://${host}:${port}`);
      const provided = url.searchParams.get('token');
      if (!provided || provided !== token) {
        return false;
      }
      if (!fixedToken && Date.now() > tokenExpiresAt) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  wss.on('connection', (ws) => {
    void runSession(ws, projectRoot, config);
  });

  return new Promise<AgentServer>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.off('error', reject);
      const addr = httpServer.address();
      const resolvedPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        url: `http://${hostForUrl(host)}:${resolvedPort}`,
        token,
        close: () =>
          new Promise<void>((res) => {
            wss.close(() => httpServer.close(() => res()));
          }),
      });
    });
  });
}

/**
 * Drive one paired socket: build the workspace + provider, implement the
 * DeviceBridge over this socket (tool_call → await tool_result by callId), and
 * run the agent loop for each inbound `ask`.
 */
async function runSession(
  ws: WebSocket,
  projectRoot: string,
  config: AppLensConfig,
): Promise<void> {
  const access = await FileAccess.create(projectRoot);
  const provider = createAIProvider(config);

  // Pending device tool calls awaiting their tool_result, keyed by callId.
  const pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  const bridge: DeviceBridge = {
    callDeviceTool(name: DeviceToolName, args, timeout = TOOL_TIMEOUT_MS) {
      return new Promise<unknown>((resolve, reject) => {
        const callId = mintToken();
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`Device tool '${name}' timed out after ${timeout}ms`));
        }, timeout);
        pending.set(callId, { resolve, reject, timer });
        send(ws, { type: 'tool_call', callId, name, args });
      });
    },
  };

  ws.on('message', (data) => {
    let msg: DeviceToAgentMessage;
    try {
      msg = JSON.parse(data.toString()) as DeviceToAgentMessage;
    } catch {
      return; // ignore malformed frames
    }

    if (msg.type === 'tool_result') {
      const entry = pending.get(msg.callId);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(msg.callId);
        entry.resolve(msg.result);
      }
      return;
    }

    if (msg.type === 'ask') {
      void handleAsk(msg);
    }
  });

  ws.on('close', () => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Device disconnected'));
    }
    pending.clear();
  });

  async function handleAsk(ask: AskMessage): Promise<void> {
    try {
      const result = await runAgentLoop(
        { provider, access, bridge, projectRoot },
        ask.question,
        ask.conversation ?? [],
        {
          onToken: (delta) => send(ws, { type: 'token', askId: ask.id, delta }),
          onPatch: (patch: ProposedPatch) =>
            send(ws, {
              type: 'patch',
              askId: ask.id,
              path: patch.path,
              diff: patch.diff,
              rationale: patch.rationale,
            }),
        },
      );
      send(ws, {
        type: 'answer',
        askId: ask.id,
        text: result.text,
        usage: result.usage,
      });
    } catch (err) {
      send(ws, {
        type: 'error',
        askId: ask.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Serialize + send a message to the device if the socket is open. */
function send(ws: WebSocket, message: AgentToDeviceMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Mint a short random single-session token. */
function mintToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** Pick the host string to embed in a URL (0.0.0.0 → 127.0.0.1 for the link). */
function hostForUrl(host: string): string {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}
