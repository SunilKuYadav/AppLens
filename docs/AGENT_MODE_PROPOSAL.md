# AppLens Agent Mode — Proposal

> How AppLens evolves from a runtime debugging library into a project-aware coding agent that reads your source, correlates it with runtime behavior, proposes changes, and — with your approval — edits files and runs checks.

For AppLens, the right approach is to give the AI agent access to your React Native project through a **separate local developer agent**, rather than giving the React Native app direct filesystem access.

This is how AppLens can work like Cursor or Kiro: it inspects your source, correlates it with the network/console/error data AppLens already captures at runtime, suggests changes, and — only with your approval — edits files and runs verification. Crucially, this fits AppLens as it exists today: the only part of AppLens that already touches real files on disk is the **Node-only Code Indexer** (`src/ai/index-project-ast.js`, shipped as the `applens-index` bin). The in-app bundle runs inside Metro and has no host filesystem access. Agent mode extends the Node side AppLens already has — it does not try to bolt filesystem access onto the device.

---

## 1. Recommended architecture

```
                 Your React Native app
   ┌─────────────────────────────────────────────────┐
   │  @applens/react-native  (runs inside Metro)       │
   │  Network · Console · Errors · Events · AI tab     │
   └───────────────────────────┬───────────────────────┘
                               │  Authenticated local connection
                               │  (loopback / LAN, short-lived token)
                               ▼
   ┌─────────────────────────────────────────────────┐
   │  @applens/agent   (runs on the developer's Mac/PC)│
   │                                                   │
   │  File tools          Search · read · inspect sym. │
   │  Code intelligence   Imports · references · flow  │
   │  Local AI model      Qwen2.5-Coder-14B-Instruct   │
   │                      (via existing OpenAIProvider │
   │                       pointed at LM Studio)       │
   │  Permission layer    Controls reads/edits/commands│
   └───────────────────────────┬───────────────────────┘
                               │  Tool results + approved actions
                               ▼
   ┌─────────────────────────────────────────────────┐
   │  Your project workspace                           │
   │  src/ · app/ · package.json · tests/ · config     │
   └─────────────────────────────────────────────────┘
```

The key idea: **the AI model does not get direct filesystem access.** The agent exposes a small set of controlled tools the model can *request*. The agent executes them against the workspace and returns results. The model never calls `fs` itself.

This mirrors the layering AppLens already documents (UI → singleton → interceptors/storage/AI layer). Agent mode slots in as a new consumer of the AI layer that lives in a Node process rather than the bundle.

---

## 2. How to give the agent file access

Create a separate Node.js process that runs **from the developer's project directory** — exactly like `applens-index` does today, but long-lived and interactive.

```sh
# in your React Native project root
npx @applens/agent --project .
```

The agent starts with the selected project as its workspace:

```
triveni-point/
├── src/
├── app/
├── components/
├── services/
├── package.json
├── tsconfig.json
└── ...
```

The agent can now use Node's filesystem APIs to read files, list directories, and — when authorized — write changes. But **you don't expose the whole filesystem to the model**; you expose controlled tools with a workspace boundary.

### Example: a file-reading tool

A simplified TypeScript implementation for the `@applens/agent` package. Note this reuses the same classification/ignore mindset the existing `AstCodeIndexer` already applies when it walks `./src`.

```ts
// packages/agent/src/tools/read-file.ts
import path from "node:path";
import { readFile, realpath } from "node:fs/promises";

export function createReadFileTool(workspaceRoot: string) {
  return {
    name: "read_file",
    description: "Read a source file inside the authorized project workspace.",

    async execute(relativePath: string) {
      const root = await realpath(workspaceRoot);
      const target = path.resolve(root, relativePath);

      // Block paths that escape the workspace.
      const relative = path.relative(root, target);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error("Access denied: path is outside the workspace");
      }

      // Resolve symlinks before reading to prevent workspace escapes.
      const resolvedTarget = await realpath(target);
      const resolvedRelative = path.relative(root, resolvedTarget);
      if (
        resolvedRelative === ".." ||
        resolvedRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(resolvedRelative)
      ) {
        throw new Error("Access denied: file resolves outside workspace");
      }

      if (relativePath.split(/[\\/]/).includes("node_modules")) {
        throw new Error("Access denied: node_modules is excluded");
      }

      const content = await readFile(resolvedTarget, "utf8");
      if (content.length > 100_000) {
        throw new Error("File too large; use a ranged read instead");
      }

      return { path: relativePath, content };
    },
  };
}
```

This is a starting point, not a complete security boundary. In production, also exclude secrets and sensitive files (`.env`, keystores, `*.pem`), honor `.gitignore`, enforce file-size and binary-file limits, and re-check permissions on **every** tool call. The same restrictions apply to search, writes, and command execution. This is the same discipline AppLens already uses for redaction — secrets are stripped before data is ever stored or shown; agent mode extends that principle to the filesystem.

---

## 3. How the AI actually uses those files

Suppose you ask AppLens:

> Why is the checkout screen showing the wrong payment amount?

The agent investigates in steps rather than loading the whole repo.

**Step 1 — Understand the question.** The model identifies the relevant runtime error, API response, or screen from the AppLens runtime context it already has (network/console/errors/events).

**Step 2 — Search the code.** It calls `search_code`, `find_symbol`, and `read_file` to locate the checkout component and the payment service.

**Step 3 — Correlate runtime and source.** It compares the *actual* captured network response (AppLens already stores request/response bodies, truncated to 50 KB) against the transformations and state updates in the source. This is the correlation AppLens's `ContextEngine` approximates today from a static graph — agent mode makes it live and precise.

**Step 4 — Propose or apply a fix.** It produces a patch, shows a diff, and asks for approval before modifying files.

**Step 5 — Verify.** With permission, it runs targeted tests or `tsc --noEmit` (the exact check AppLens itself uses as its verification gate) and reports the real results.

The model's **tool-calling loop** is what makes this an agent: the model requests a tool → the agent executes it → the result goes back → the model decides what to do next. This is the same pattern described by the Model Context Protocol tool specification, and it layers cleanly on the `AIProvider` interface AppLens already has (`createAIProvider()`, `OpenAIProvider`, `LocalAIProvider`).

---

## 4. Which tools should AppLens expose?

Start with these, then expand.

| Tool               | Permission            | Purpose                                       |
| ------------------ | --------------------- | --------------------------------------------- |
| `list_files`       | Read                  | Explore project structure                     |
| `search_files`     | Read                  | Find files by name or pattern                 |
| `search_code`      | Read                  | Find API calls, functions, and variables      |
| `read_file`        | Read                  | Inspect source code                           |
| `find_symbol`      | Read                  | Locate a component or function                |
| `find_usages`      | Read                  | Find where a function or state value is used  |
| `get_network_logs` | Read                  | Inspect requests from the running app         |
| `get_console_logs` | Read                  | Investigate runtime errors                    |
| `get_git_diff`     | Read                  | Review current changes                        |
| `propose_patch`    | Suggest               | Generate a proposed code change               |
| `apply_patch`      | Approval required     | Apply an approved change                      |
| `run_tests`        | Execution permission  | Run approved test commands                    |
| `run_typecheck`    | Execution permission  | Verify TypeScript errors (`tsc --noEmit`)     |

For early versions, implement `list_files`, `search_code`, `read_file`, `get_network_logs`, and `get_console_logs` first. Those already enable useful debugging without giving the agent write access — and the last two are a thin wrapper over data AppLens's storage layer already holds in memory.

`find_symbol` / `find_usages` have a head start: the existing `AstCodeIndexer` already resolves declarations and imports through the TypeScript compiler API. Agent mode can reuse that machinery instead of re-building symbol resolution from scratch.

---

## 5. How to integrate this with the React Native SDK

Split AppLens into two packages.

### `@applens/react-native` — installed in the developer's application
- Collects network requests, console logs, errors, and events (today's interceptors, unchanged).
- Provides the in-app debugging modal and the AI tab.
- Sends runtime context to the connected developer agent over the local link.

### `@applens/agent` — runs on the developer's computer
- Owns filesystem access and project indexing (absorbs today's `CodeIndexer` / `AstCodeIndexer`).
- Connects runtime logs to source code.
- Runs the model and its tools (reuses `AIProvider` / `OpenAIProvider`, pointed at LM Studio or OpenAI).
- Manages approvals, edits, and verification.

The application initializes the SDK as it does today:

```ts
import { AppLens } from "@applens/react-native";

AppLens.initialize({
  enabled: __DEV__,
  network: true,
  console: true,
  events: true,
  errors: true,
  ai: true,
});
```

The developer starts the agent separately:

```sh
npx @applens/agent --project .
```

The SDK then connects to the agent's local service. Host addressing follows the same rules AppLens already documents for LM Studio: on an Android emulator `127.0.0.1` is the emulator itself, so reach the host via `10.0.2.2`; a physical device uses your computer's LAN IP; the iOS simulator uses `127.0.0.1`.

| Platform          | Agent address                       |
| ----------------- | ----------------------------------- |
| iOS simulator     | `http://127.0.0.1:<port>`           |
| Android emulator  | `http://10.0.2.2:<port>`            |
| Physical device   | `http://<your-computer-LAN-IP>:<port>` |

Secure the connection with pairing or a short-lived token, bind to a safe interface, and restrict it to development builds (`__DEV__`). **Never expose a filesystem-enabled agent to the public internet.**

---

## 6. How should agent-mode permissions work?

Three escalating modes the developer explicitly chooses:

**Read-only.** Inspect code and logs; cannot change files or run commands.

**Suggest changes.** Prepare patches and show diffs; *you* apply them yourself.

**Agent mode.** Apply approved changes and run allowlisted verification commands.

| Mode             | Inspect code & logs | Generate patches | Modify workspace | Run commands        |
| ---------------- | ------------------- | ---------------- | ---------------- | ------------------- |
| Read-only        | ✅                  | ❌               | ❌               | ❌                  |
| Suggest changes  | ✅                  | ✅               | ❌ (you apply)   | ❌                  |
| Agent mode       | ✅                  | ✅               | ✅ (on approval) | ✅ (allowlist only) |

These are **proposed AppLens permissions, not built-in model modes.** Even in agent mode, enforce permissions in the agent's *code* — not just in a system prompt. Tool execution must be validated, restricted, auditable, and subject to user approval for sensitive operations. Dry-run (`suggest`) should be the default; `apply_patch` and `run_*` require an explicit opt-in, consistent with AppLens's "local-by-default, nothing leaves the machine unless you configure it" posture.

---

## 7. Suggested project structure

```
applens/
├── packages/
│   ├── react-native/
│   │   └── src/
│   │       ├── collectors/        # today's interceptors/
│   │       ├── runtime/
│   │       ├── transport/         # NEW: link to the agent
│   │       └── ui/                # today's tabs/ + components/
│   │
│   └── agent/
│       └── src/
│           ├── cli/               # npx @applens/agent entrypoint
│           ├── server/            # local service the SDK connects to
│           ├── workspace/
│           │   ├── file-access.ts # the boundary from §2
│           │   └── ignore-rules.ts
│           ├── tools/             # the table from §4
│           ├── code-intelligence/ # absorbs AstCodeIndexer
│           ├── context/           # absorbs ContextEngine
│           ├── model/             # absorbs AIProvider/OpenAIProvider
│           ├── agent-loop/        # the tool-calling loop from §3
│           ├── permissions/       # the modes from §6
│           └── verification/      # tsc --noEmit, tests
│
└── package.json
```

---

## Recommended build order

Build the local agent and its **safe file tools before** adding advanced AI features to the modal. Concretely:

1. **Workspace boundary + read tools** (`list_files`, `search_code`, `read_file`) — the hardest-to-get-right security piece, built first.
2. **Wire in runtime logs** (`get_network_logs`, `get_console_logs`) — reuse AppLens's existing storage; immediate debugging value, still read-only.
3. **Agent loop + model** — connect the `AIProvider` tool-calling loop so the model can drive the read tools.
4. **Patch generation + approvals** (`propose_patch` → `apply_patch`) — introduce writes behind the permission layer.
5. **Verification** (`run_typecheck`, `run_tests`) — close the loop with real check results.

That path takes AppLens from a debugging library to a real coding agent **without ever giving the model unrestricted access to the developer's machine** — each step adds capability only behind an enforced boundary.

---

## Open decisions to confirm before implementation
- **Monorepo move:** adopting `packages/*` means restructuring today's single-package repo and its git-tag install flow (`#v0.3.2`). Do we split now, or ship `@applens/agent` as a second entry inside the current package first?
- **Transport: WebSocket for the session, HTTP only for pairing (decided).** The agent loop is inherently multi-event and bidirectional — one question yields a stream of `tool_call` / `tool_result` / `token` events downstream and `approve`/`reject` round-trips upstream, with the loop pausing mid-flight to wait for an approval. A WebSocket models that push-then-wait flow natively; HTTP + token would force SSE for the downstream stream plus separate POSTs for approvals, rebuilding a worse WebSocket. Use a one-shot `POST /pair` over HTTP to mint the short-lived token and hand back the WS URL; everything after (questions, token deltas, tool events, approvals) rides one authenticated WS connection. Note the AI tab's current "streaming" is client-side only — `OpenAIProvider.chatStream()` streams directly from the OpenAI/LM Studio endpoint inside the bundle — so the app⇄agent link is a brand-new channel, not an extension of an existing AppLens transport. Bind the WS server to loopback by default, widen to LAN only behind an explicit flag, require the pairing token on the WS upgrade, and gate the whole thing to `__DEV__`.
- **First milestone:** confirm steps 1–3 (read-only, no writes) as the initial deliverable, with 4–5 as a follow-up.
