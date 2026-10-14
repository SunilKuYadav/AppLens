# AppLens Agent Mode — Milestone 1 Implementation Plan

Authoritative spec: `docs/AGENT_MODE_M1_PLAN.md` (follow its section 7 build order and
scope exactly; do not re-design). This file sequences that spec into ordered, verifiable
build steps grounded in the existing code.

## Scope (frozen)

Read + suggest-patch only. No project-source writes, no command execution. Ships inside the
existing `@applens/react-native` package as a new bin `applens-agent`. M1 tools: `list_files`,
`search_code`, `read_file` (resolve locally in the agent process) · `get_network_logs`,
`get_console_logs` (resolve ON THE DEVICE via WS round-trip from `AppLensStorage`) ·
`propose_patch` (suggest-only unified diff, writes nothing).

Out of scope (do NOT build): `apply_patch` or any project-source write; `run_tests`/
`run_typecheck`/any command execution; `find_symbol`/`find_usages` (AST tools); native
function-calling; monorepo split; apply/reject buttons on patch bubbles.

## Architecture facts (do not invert)

- `src/agent/**` is Node-only (imports `node:fs`, `ws`). It must NEVER be importable into
  the RN bundle. Only `src/agent-client/**` and shared protocol TYPES re-export from
  `src/index.ts`. The bin wrapper `src/ai/index-agent.js` is the sole entry into `src/agent/**`.
- Network/console logs live in the DEVICE's `AppLensStorage` ring buffers, not on the laptop.
  `get_network_logs`/`get_console_logs` resolve on the device: model issues tool call → agent
  forwards a `tool_call` WS message to the device → device answers from `AppLensStorage` →
  returns `tool_result`. File tools resolve locally in the agent process.
- Values in `AppLensStorage` are ALREADY redacted at capture; no new redaction path needed.
- The model (`AIProvider.chatStream`) has NO native function-calling in the current code, so
  M1 is a PROMPT-DRIVEN tool protocol: strict JSON tool-call parsing + an 8-round cap.

## Project build/test commands (verified)

- Type-check: `npm run type-check` (`tsc --noEmit`).
- Build: `npm run build` (`tsc -p tsconfig.build.json`). `tsconfig.build.json` already
  includes all `src/**/*.ts|tsx|js`, so `src/agent/**` compiles with no config change — confirm it.
- No root test framework exists today (only `Example/` uses jest). FileAccess tests use
  Node's built-in `node:test` (no new dependency). Add a root script
  `"test:agent": "node --test dist/agent/workspace/"` that runs the compiled tests after `npm run build`.

---

# Implementation Plan

- [ ] 1. Add `aiAgentURL?: string` config field.
      Add optional `aiAgentURL?: string` to `AppLensConfig` (documented: undefined = agent
      feature off) and add `aiAgentURL: undefined` to `DEFAULT_CONFIG`.
      Files: `src/core/AppLensConfig.ts`
      Verify: `npm run type-check` passes.

- [ ] 2. Build the workspace security boundary: `FileAccess` + ignore rules.
      `FileAccess` class: `realpath(root)` up front; `resolve(relativePath)` rejects absolute
      inputs and `..` escapes, `path.resolve`s against the real root, then re-runs `realpath`
      on the target and re-checks it is still inside the real root (defeats symlink escape);
      `readFile(path, range?)` enforces a size cap (100 KB) and a binary sniff (reject NUL/
      non-UTF-8). `ignoreRules.ts` deny-list: `node_modules`, `.git`, `.env*`, `*.pem`,
      `*.keystore`, `*.jks`, `id_rsa*`; honor `.gitignore` where cheap. Pure Node, no WS/model.
      Files: `src/agent/workspace/FileAccess.ts`, `src/agent/workspace/ignoreRules.ts`
      Verify: `npm run build` compiles; then step 3's tests pass.

- [ ] 3. Add `node:test` coverage for `FileAccess`.
      Cover: `../` escape rejected; absolute path rejected; symlink-escape rejected;
      in-workspace read ok; deny-list enforced; size cap enforced. Create a temp workspace
      with fixtures (including a symlink pointing outside) in the test setup.
      Add root script `"test:agent": "node --test dist/agent/workspace/"`.
      Files: `src/agent/workspace/FileAccess.test.ts`, `package.json` (scripts)
      Verify: `npm run build && npm run test:agent` — all FileAccess tests pass.

- [ ] 4. Build the read tools on top of `FileAccess`.
      `listFiles(dir?)` → depth-limited, ignore-filtered tree; `searchCode(query, glob?)` →
      Node `fs` walk + regex, returns file + line + context (no external `rg`); `readFile(path, range?)`
      → delegates to `FileAccess.readFile`. All paths validated through `FileAccess`.
      Files: `src/agent/tools/listFiles.ts`, `src/agent/tools/searchCode.ts`, `src/agent/tools/readFile.ts`
      Verify: `npm run build` compiles clean.

- [ ] 5. Define the WS protocol types.
      `protocol.ts` exports message types: `ask` {type,id,question,conversation};
      agent→device `token` {type,askId,delta}, `patch` {type,askId,path,diff,rationale},
      `answer` {type,askId,text,usage}, `error` {type,askId,message}; device-side tool
      `tool_call` {type,callId,name:'get_network_logs'|'get_console_logs',args},
      `tool_result` {type,callId,result}. Pairing: `POST /pair {clientInfo} → {token,wsUrl}`.
      These TYPES are the only `src/agent` surface re-exported from the barrel.
      Files: `src/agent/protocol.ts`
      Verify: `npm run type-check` passes.

- [ ] 6. Build the pairing HTTP server + WS upgrade skeleton (echo loop, no model yet).
      Add `ws` to `dependencies` pinned to a current stable release. `server.ts`: HTTP
      `POST /pair` mints a short-lived single-session token + returns `{token, wsUrl}`; WS
      upgrade validates the token (query param/subprotocol) and rejects anything else; bind
      `127.0.0.1` by default. One session = one loop bound to the paired socket.
      Files: `src/agent/server.ts`, `package.json` (dependencies: `ws`)
      Verify: `npm install && npm run build` compiles; manual: `POST /pair` returns a token and WS URL, a bad token is rejected on upgrade.

- [ ] 7. Build `AgentClient` (device side) + AITab reachability probe/fallback.
      `AgentClient` (RN-safe, global `WebSocket`): `POST /pair`, open WS, `ask(question,
      conversation, {onToken, onPatch})`; answers inbound `tool_call` for `get_network_logs`/
      `get_console_logs` from `AppLens.getStorage().getNetworkRequests()`/`.getLogs()` shaped
      as compact capped summaries. `AITab` on mount probes `aiAgentURL`: reachable → route
      `handleSend` through `AgentClient.ask`, stream token deltas via existing
      `streamBufferRef`/`scheduleFlush`; unreachable/unset → today's exact `provider.chatStream`
      + `ContextEngine` path (NO regression). Export `AgentClient` + protocol types from barrel.
      Files: `src/agent-client/AgentClient.ts`, `src/tabs/AITab.tsx`, `src/index.ts`
      Verify: `npm run type-check` passes; manual: with no agent running the AI tab behaves exactly as today.

- [ ] 8. Wire the runtime-log tools round-trip (device answers `get_*_logs`).
      Agent exposes `get_network_logs`/`get_console_logs` to the model; their executor sends a
      `tool_call` over WS and awaits the matching `tool_result` (correlated by `callId`), with a
      count cap and timeout. Device side already answers in step 7.
      Files: `src/agent/tools/runtimeLogTools.ts` (agent-side executors), wired into the loop in step 9
      Verify: `npm run build` compiles; covered end-to-end by the smoke test (step 12).

- [ ] 9. Build the prompt-driven agent loop over `AIProvider`.
      `agentLoop.ts` wraps `createAIProvider(config)`/`chatStream`. System prompt describes the
      six tools and a strict JSON tool-call format; the loop parses tool-call JSON from the
      model, dispatches to local file tools or device-side log tools, feeds results back, and
      repeats. Streams reply tokens out as `token` messages; emits a `patch` message when the
      model calls `propose_patch`. Hard cap of 8 tool rounds.
      Files: `src/agent/loop/agentLoop.ts`
      Verify: `npm run build` compiles; manual loop smoke in step 12.

- [ ] 10. Build `propose_patch` (suggest-only).
      Input: target path + proposed new content (or diff). Output: a unified diff string + a
      short rationale. WRITES NOTHING. Validate the target path through `FileAccess` so a patch
      can't name a file outside the workspace.
      Files: `src/agent/tools/proposePatch.ts`
      Verify: `npm run build` compiles.

- [ ] 11. Render the diff bubble + append the per-question run report.
      In `AITab`, render `patch` messages as a NEW read-only diff bubble reusing the markdown/
      code styling with a Copy button (no apply/reject). The agent appends a per-question run
      report (question, tools called with args, files read, proposed diffs, final answer +
      confidence) to `applens-agent-report.md` in the project root — the ONLY allowed write;
      never project source.
      Files: `src/tabs/AITab.tsx`, `src/agent/loop/agentLoop.ts` (or a small `reportWriter.ts`)
      Verify: `npm run type-check` passes; smoke test (step 12) confirms the report file is appended.

- [ ] 12. Build the CLI + bin wrapper and finalize packaging.
      `cli.ts`: parse `--project` (default cwd), `--port`, `--host` (default `127.0.0.1`;
      `--host 0.0.0.0` only with explicit flag + printed LAN-exposure warning), `--token`
      (optional). Resolve + validate the project root up front, print workspace + loopback URL
      + pairing token, start `server.ts`. `index-agent.js` mirrors `index-project-ast.js`:
      `require('../agent/cli')` from compiled dist with a ts-node fallback. Add
      `"applens-agent": "dist/ai/index-agent.js"` to `bin`.
      Files: `src/agent/cli.ts`, `src/ai/index-agent.js`, `package.json` (bin)
      Verify: `npm run build` emits `dist/ai/index-agent.js` and `dist/agent/cli.js`; confirm
      nothing from `src/agent` leaks into `dist/index.js`/barrel (only `AgentClient` + protocol
      types). Documented manual e2e: `npx applens-agent --project .` against `Example/`, pair
      from a tiny WS test client, ask a question forcing a `read_file` + a `get_console_logs`
      round-trip, confirm a `patch` message returns and `applens-agent-report.md` is appended.

## Final verification checklist

1. `npm run type-check` clean.
2. `npm run build` emits `dist/ai/index-agent.js`; `src/agent/**` compiles; no `src/agent`
   leak into the RN-facing barrel (only `AgentClient` + protocol types exported).
3. `npm run test:agent` — `FileAccess` node:test cases all pass (`../` escape rejected,
   absolute rejected, symlink-escape rejected, in-workspace read ok, deny-list enforced,
   size cap enforced).
4. Documented manual e2e smoke steps run (step 12).
5. No-regression: with no agent running / `aiAgentURL` unset, the AI tab behaves exactly as today.
