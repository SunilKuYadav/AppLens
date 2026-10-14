# Agent Mode — Milestone 1 Implementation Plan

> Scope frozen with the user: **read + suggest-patch only.** The agent reads real
> project files on the developer's machine; the AI tab (on device) asks questions
> and renders proposed diffs. **No writes, no command execution** in M1. Ships
> inside the **existing `@applens/react-native` package** as a new `bin`
> (`applens-agent`) — no monorepo split, no change to the `#v0.3.x` git-tag install.

---

## 0. Decisions locked in

| Decision | Choice |
|---|---|
| Packaging | Same package, new `bin: applens-agent` (mirrors the existing `applens-index` bin) |
| M1 tools | `list_files`, `search_code`, `read_file` (read) · `get_network_logs`, `get_console_logs` (runtime) · `propose_patch` (suggest-only diff) |
| Writes / commands | **Out of scope for M1** — no `apply_patch`, no `run_tests`/`run_typecheck` |
| Transport | WebSocket for the session; one-shot `POST /pair` (HTTP) to mint a token + hand back the WS URL |
| AI tab behavior | Auto-connect to local agent when reachable; fall back to today's direct-LLM + static-graph path when not |

### One correction to the proposal's data-flow story (please note)

The proposal (and the mental model so far) says the **app sends runtime logs to the
agent**. In the real code, network/console logs live **in the device's
`AppLensStorage` ring buffers** (`getNetworkRequests()`, `getLogs()`), and the AI
tab's `ContextEngine` already reads them locally. The agent process on the laptop
has **no copy** of them.

So the correct direction for `get_network_logs` / `get_console_logs` is:

- The **model** (running wherever the agent drives it) issues a `get_network_logs`
  tool call → the **agent** forwards that request **back to the device over the same
  WS** → the **device** answers from its `AppLensStorage` → the agent returns the
  result to the model.

In other words, the device is both the client (asks questions) **and** a *tool
provider* for the two runtime-log tools. File tools (`read_file` etc.) resolve on
the laptop; log tools resolve on the device. This is the single most important
architectural fact for M1 and it changes how the WS protocol is shaped (below).

> Alternative considered: have the device *push* a snapshot of logs to the agent on
> each question. Rejected for M1 — it duplicates the ring buffers, goes stale, and
> can blow past message-size limits on a busy app. Request/response over the
> existing WS is simpler and always current.

---

## 0.5 How a developer runs the agent (confirmed run flow)

1. **Install** — unchanged from today. The app depends on AppLens via the git tag;
   the `applens-agent` bin ships inside the same package, so `prepare` compiles
   `dist/ai/index-agent.js` on install. No extra install step.

2. **Run the agent** from the project root in a normal terminal (not the device):
   ```sh
   npx applens-agent --project .
   ```
   Prints the workspace, the loopback listen URL (e.g. `http://127.0.0.1:4747`), and
   a short-lived pairing token, then waits for a device to connect. Flags:
   `--project` (workspace root, default cwd), `--port`, `--host` (default
   `127.0.0.1`; `--host 0.0.0.0` only for a physical device over LAN, with a printed
   warning). Same muscle memory as the existing `npx applens-index ./src`.

3. **Point the app at the agent** via the new `aiAgentURL` config field, using the
   same emulator/simulator/LAN addressing rules as LM Studio:
   ```ts
   AppLens.initialize({
     enabled: __DEV__,
     ai: true,
     aiAgentURL: 'http://127.0.0.1:4747',   // iOS simulator
     // Android emulator: 'http://10.0.2.2:4747'
     // Physical device:  'http://<your-computer-LAN-IP>:4747'  (needs --host 0.0.0.0)
   });
   ```

4. **Use it** from the AI tab. On mount it probes `aiAgentURL`:
   - **Reachable** → pairs (`POST /pair`), opens the WS, routes questions through the
     agent (reads project files, pulls runtime logs back from the device, streams the
     answer + any proposed diff).
   - **Not reachable / unset** → unchanged current behavior (direct LLM + static
     graph). No regression.

Pairing policy: auto-pair on loopback (same machine / iOS sim); require the printed
token on LAN (physical device). Loopback auto-discovery on the default port is a
possible later convenience; M1 uses the explicit `aiAgentURL`.

---

## 1. Where the code lives (same package)

```
src/
├── agent/                      # NEW — Node-only, never imported by the RN bundle
│   ├── cli.ts                  # arg parsing: --project, --port, --host, --token
│   ├── server.ts               # HTTP /pair + WebSocket upgrade; the session loop
│   ├── workspace/
│   │   ├── FileAccess.ts       # the workspace boundary (realpath, escape checks)
│   │   └── ignoreRules.ts      # node_modules, .git, .env, keystores, .gitignore
│   ├── tools/
│   │   ├── listFiles.ts
│   │   ├── searchCode.ts
│   │   ├── readFile.ts
│   │   └── proposePatch.ts     # produces a unified diff; DOES NOT write
│   ├── loop/
│   │   └── agentLoop.ts        # tool-calling loop over the AIProvider
│   └── protocol.ts             # shared WS message types (device ⇄ agent)
├── agent-client/               # NEW — RN-safe, imported by the bundle
│   └── AgentClient.ts          # opens WS, pairs, answers device-side tool calls
├── ai/
│   └── index-agent.js          # NEW bin wrapper (mirrors index-project-ast.js)
└── index.ts                    # add AgentClient + protocol type exports
```

Build/packaging changes:

- `package.json` → add `"applens-agent": "dist/ai/index-agent.js"` to `bin`.
- `src/agent/**` must stay Node-only. It imports `node:fs`, `ws`, etc. and must
  **never** be pulled into the RN bundle. Enforce by: (a) only `src/agent-client`
  and `src/protocol` types are re-exported from `index.ts`; (b) the bin wrapper is
  the sole entry to `src/agent`.
- New runtime dep: `ws` (WebSocket server/client for Node). The device side uses the
  RN global `WebSocket` — no new RN dependency.
- `tsconfig.build.json` already emits `dist/`; confirm it compiles `src/agent/**`.

> Open question for review: `ws` is a Node-only dep but would land in
> `dependencies`. Options: (a) `dependencies` and accept it installs for app
> consumers too (small), or (b) `optionalDependencies` / `peerDependencies` so only
> agent users pull it. **Recommendation: `dependencies`** for M1 simplicity; revisit
> if bundle/install size matters.

---

## 2. The WebSocket protocol (device ⇄ agent)

One connection, JSON messages, each with a `type` and `id` for request/response
correlation. Three message families:

**A. Device → agent (a question):**
```
{ type: "ask", id, question, conversation }   # conversation = prior AIMessage[]
```

**B. Agent → device (streaming the answer):**
```
{ type: "token", askId, delta }               # incremental reply text
{ type: "patch", askId, path, diff, rationale }  # a proposed unified diff
{ type: "answer", askId, text, usage }        # final reply + token usage
{ type: "error", askId, message }
```

**C. Agent → device (device-side tool call) and its reply:**
```
{ type: "tool_call", callId, name: "get_network_logs" | "get_console_logs", args }
{ type: "tool_result", callId, result }       # device answers from AppLensStorage
```

File tools (`list_files`, `search_code`, `read_file`, `propose_patch`) never cross
to the device — the agent runs them locally and feeds results straight into the
model loop.

Pairing handshake (HTTP, one-shot):
```
POST /pair  { clientInfo }  →  { token, wsUrl }   # token is short-lived, single-session
```
The device then opens `wsUrl`, presenting `token` as a query param / subprotocol;
the server validates it on upgrade and rejects anything else.

---

## 3. Component-by-component build

### 3.1 `FileAccess` + ignore rules (security boundary — build first)
- `resolve(relativePath)`: `realpath(root)`, `path.resolve`, reject `..` escapes,
  **re-run realpath on the target** to defeat symlink escapes (as in the proposal
  sample), reject absolute inputs.
- Deny-list: `node_modules`, `.git`, and secret-ish files (`.env*`, `*.pem`,
  `*.keystore`, `*.jks`, `id_rsa*`). Honor `.gitignore` where cheap.
- Size cap (e.g. 100 KB) and a binary sniff (reject non-UTF-8/NUL-containing files).
- Unit-testable as a pure Node module — no WS, no model.

### 3.2 Read tools
- `list_files(dir?)` → directory tree (depth-limited), ignore-filtered.
- `search_code(query, glob?)` → ripgrep-style matches with file + line + context.
  Implementation: Node `fs` walk + regex (no external `rg` dependency assumed).
- `read_file(path, range?)` → file contents via `FileAccess`, optional line range.

### 3.3 Runtime-log tools (resolve on device)
- Agent exposes `get_network_logs` / `get_console_logs` to the model, but their
  executor sends a `tool_call` to the device and awaits `tool_result`.
- Device side (`AgentClient`) answers from `AppLens.getStorage().getNetworkRequests()`
  / `.getLogs()`, applying the **same redaction** already applied at capture (values
  are already redacted in storage; no new secret-exposure path).
- Shape the result as compact summaries (method/url/status/duration; level/message/
  timestamp) with a count cap so a busy buffer doesn't overflow a WS frame.

### 3.4 `propose_patch` (suggest-only)
- Input: target path + the model's proposed new content (or a diff).
- Output: a **unified diff** string + a short rationale. **Writes nothing.**
- Validate the path through `FileAccess` so a proposed patch can't name a file
  outside the workspace.

### 3.5 Agent loop
- Wraps the existing `AIProvider` (`createAIProvider(config)` /
  `OpenAIProvider.chatStream`). The provider doesn't do native tool-calling in the
  current code, so M1 uses a **prompt-driven tool protocol**: the system prompt
  describes the tools and a strict JSON call format; the loop parses tool-call JSON
  from the model, executes it, feeds the result back, and repeats until the model
  emits a final answer. (A later milestone can switch to native function-calling.)
- Streams reply tokens out as `token` messages; emits `patch` messages when the
  model calls `propose_patch`.
- Hard iteration cap (e.g. 8 tool rounds) to prevent runaway loops.

### 3.6 Server (`server.ts` + `cli.ts`)
- `cli.ts`: parse `--project` (default cwd), `--port`, `--host` (default
  `127.0.0.1`), `--token` (optional fixed token for dev). Resolve + validate the
  project root up front.
- `server.ts`: HTTP server for `POST /pair`; WS upgrade guarded by the token; one
  session = one loop instance bound to the paired device socket.
- Bind **loopback by default**; `--host 0.0.0.0` only with an explicit flag, printed
  with a visible LAN-exposure warning. Gate intended for `__DEV__` use only.

### 3.7 `AgentClient` (device side) + AI-tab wiring
- `AgentClient`: given a base URL, performs `POST /pair`, opens the WS, exposes
  `ask(question, conversation, { onToken, onPatch })`, and answers inbound
  `tool_call`s from `AppLensStorage`.
- `AITab.tsx`: on mount, probe for a local agent (config-provided URL, e.g.
  `aiAgentURL`, with the same emulator/simulator/LAN addressing rules as LM Studio).
  - **Agent reachable** → route `handleSend` through `AgentClient.ask`; render
    `token` deltas with the existing streaming buffer; render `patch` messages as a
    new diff bubble (reuse the markdown/code styling; a later milestone adds
    apply/reject buttons — M1 shows the diff read-only with a Copy button).
  - **Not reachable** → unchanged current behavior (`provider.chatStream` + static
    `ContextEngine`). No regression when no agent is running.
- New config field: `aiAgentURL?: string` in `AppLensConfig` + `DEFAULT_CONFIG`
  (undefined = feature off). Documented alongside the LM Studio host table.

---

## 4. The "MD file of its working and integration" (original ask)

The agent writes a run report so each session is auditable (ties back to the very
first request — "create md file of its working and integration"):

- On each answered question, append to `applens-agent-report.md` in the project root
  (path configurable, gitignore-friendly): the question, which tools it called with
  args, files touched/read, the proposed diff(s), and the final answer + confidence.
- Pure append, read-only w.r.t. project source (writing its own report is not a
  source write, so it stays within M1's "no writes" rule for *project* files).

---

## 5. Verification (how we'll know M1 works)

1. `npm run type-check` (`tsc --noEmit`) — the project's existing gate; must pass.
2. `npm run build` — confirm `dist/ai/index-agent.js` emits and `src/agent/**`
   compiles; confirm nothing from `src/agent` leaks into the RN-facing barrel.
3. Node-level test of `FileAccess`: escape attempts (`../`, absolute, symlink)
   rejected; in-workspace reads succeed; deny-list + size cap enforced.
4. End-to-end smoke (manual, documented): run `npx applens-agent --project .`
   against the `Example/` app's source, pair from a tiny WS test client, ask a
   question that forces a `read_file` + a `get_console_logs` round-trip, confirm a
   `patch` message comes back and the report file is appended.
5. Regression: with no agent running, the AI tab behaves exactly as today.

---

## 6. Explicitly OUT of scope for M1 (so review is unambiguous)

- `apply_patch` (writing to project files) and any file mutation.
- `run_tests` / `run_typecheck` or any command execution.
- `find_symbol` / `find_usages` (AST-powered) — deferred; M1 uses text search.
- Native model function-calling (M1 uses prompt-driven tool JSON).
- Monorepo split into `@applens/agent`.
- Apply/Reject UI on patch bubbles (M1 shows diffs read-only).

---

## 7. Suggested build order (for the eventual workflow)

1. `FileAccess` + ignore rules + Node tests (security first).
2. Read tools (`list_files`, `search_code`, `read_file`) on top of `FileAccess`.
3. `protocol.ts` + `server.ts` pairing/WS skeleton (echo loop, no model yet).
4. `AgentClient` + AI-tab reachability probe + fallback (prove the channel).
5. Runtime-log tools round-trip (device answers `get_*_logs`).
6. Agent loop over `AIProvider` (prompt-driven tool calls) + `propose_patch`.
7. Diff bubble rendering in `AITab` + run-report append.
8. Type-check, build, smoke test, docs (README section + config field).
```
