# AppLens Final Revamp — Implementation Plan

This plan is grounded in a direct read of the current source on branch `modal`.
Work directly in the repo. Do NOT commit or push. Leave changes uncommitted.

Repo root: `/Users/sunilkumar/Desktop/project/AppLens/AppLens`
Example app: `/Users/sunilkumar/Desktop/project/AppLens/AppLens/Example`

---

## Verified facts about the REAL implementation (authoritative — do not contradict in docs)

### Package / entry
- `package.json` name: **`@applens/react-native`** (NOT `@app-lens/react-native`), version **0.2.0**.
- `main`/`types` both point at `src/index.ts` — ships raw TypeScript, no build step.
- Runtime deps: `openai@^4.0.0`, `react-native-markdown-display@7.0.2`. Peer: `react>=18`, `react-native>=0.71`.
- Scripts: `type-check` (`tsc --noEmit`), `example`, `example:start`, `example:ios`, `example:android`. **No test or lint script at the library root.**

### Public API (from `src/core/AppLens.ts`, exported singleton `AppLens`)
Real methods on the `AppLens` singleton:
- `initialize(partialConfig?)` — merges with `DEFAULT_CONFIG`; idempotent (2nd+ call updates config but does NOT re-attach interceptors). Creates storage + starts interceptors on first call only.
- `trackEvent(name, properties?)` — no-op when `enabled` false or `events` false.
- `reset()` — detach interceptors, clear all stores, mark uninitialized.
- `getVersion()` → returns the string `'0.2.0'` (hardcoded).
- `getConfig()` → read-only copy of active config.
- `getStorage()` → shared `AppLensStorage`.
- `loadKnowledgeGraph(manifest: GraphNode[])` — rebuild graph from a CodeIndexer manifest.
- `getKnowledgeGraph()` → current `KnowledgeGraph`.
- `isEnabled()` → initialized && enabled.
- `attachInterceptors()` / `detachInterceptors()` — runtime attach/detach used by SettingsTab.
- **There is NO `open()`/`close()` method.** The modal is opened via the floating trigger / `useAppLens().setModalVisible`.
- Spec's `AppLens.initialize({...})` + `<AppLens />` : the REAL root UI component is **`AppLensUI`** (not `<AppLens />`). `AppLens` is the data singleton, not a component. Document the real names; note the spec divergence in the roadmap.

### Config (`src/core/AppLensConfig.ts`, `AppLensConfig` + `DEFAULT_CONFIG`)
Every field and its default:
| Field | Type | Default |
|---|---|---|
| `enabled` | boolean | `true` |
| `network` | boolean | `true` |
| `console` | boolean | `true` |
| `events` | boolean | `true` |
| `errors` | boolean | `true` |
| `ai` | boolean | `true` |
| `aiProvider` | `'openai' \| 'lmstudio' \| 'local'` | `'openai'` |
| `aiApiKey` | `string?` | `undefined` |
| `aiModel` | `string?` | `undefined` |
| `aiBaseURL` | `string?` | `undefined` |
| `redactHeaders` | `string[]` | `REDACTED_HEADERS` (see below) |
| `projectRoot` | `string?` | `undefined` |
| `maxNetworkEntries` | number | `500` |
| `maxLogEntries` | number | `1000` |
| `maxEventEntries` | number | `500` |
| `persistLogs` | boolean? | `false` (RESERVED — not implemented) |
| `verboseLogging` | boolean? | `false` (declared; not consumed anywhere) |
| `redaction` | `{ headers?: string[]; fields?: string[] }?` | `undefined` (**declared but NEVER consumed** — see mismatch #2) |

`REDACTED_HEADERS` (default redacted request/response headers, from `src/types/NetworkTypes.ts`):
`authorization`, `cookie`, `x-api-key`, `x-auth-token`, `x-access-token`, `x-secret`.

### UI tabs (from `src/components/AppLensModal.tsx`)
Exactly 7, in order: **Overview, Network, Console, Events, Errors, AI, Settings**. Dark theme, horizontally scrollable tab bar, slide modal, floating trigger (`AppLensTrigger`).

### Interceptors
- **NetworkInterceptor** (`src/interceptors/NetworkInterceptor.ts`): monkey-patches global `XMLHttpRequest` (open/send/setRequestHeader) AND `fetch`. Captures: `id, method, url, status, statusText, requestHeaders, responseHeaders, requestBody, responseBody, duration, timestamp, error{message,code?,stack?}, state('pending'|'complete'|'error')`. Bodies truncated to **50 KB**. Request+response **headers are redacted** via `redactHeaders(..., config.redactHeaders)`. `state='error'` when status >= 400 or on network error/timeout. Binary/blob response bodies are skipped safely. The `NetworkRequest.context` field (`screen/hook/service/event`) EXISTS in the type but is **never populated** by the interceptor — correlation is Planned, not Implemented.
- **ConsoleInterceptor** (`src/interceptors/ConsoleInterceptor.ts`): wraps `log/info/warn/error/debug`, forwards to the original first, captures `{id, level, message(=String(args[0])), args, timestamp, stack}`. `cleanStack()` strips frames containing `ConsoleInterceptor` so AppLens's own capture frames are removed — but it does NOT prevent AppLens's own `console.*` calls from being re-captured (there is no global self-capture guard). Note this honestly: self-frame trimming yes; full self-log suppression no.
- **ErrorInterceptor** (`src/interceptors/ErrorInterceptor.ts`): installs `ErrorUtils` global handler (observes, then calls the saved handler — non-replacing). Captures unhandled promise rejections ONLY when `HermesInternal.enablePromiseRejectionTracker` exists (Hermes-only). `AppError = {id, message, stack?, timestamp, isFatal}`.

### Redaction (`src/utils/redact.ts`)
- `redactHeaders(headers, sensitiveKeys)` — case-insensitive, returns a NEW map with matched values → `'[REDACTED]'`. **Actually applied** to request and response headers in NetworkInterceptor.
- `redactFields(obj, sensitiveFields)` — recursive field redaction with cycle guard. **EXISTS but is NOT imported or called anywhere** (verified by grep: only its own definition matches). It is also NOT re-exported from `src/index.ts`.
- **CRITICAL mismatch for the redaction test scenario:** request/response BODIES are NOT field-redacted. A `password`/`token`/`Bearer ...` inside a JSON body is stored and fed to the AI verbatim. Only matching HEADER NAMES (e.g. `authorization`) are redacted. The `config.redaction.fields` option is dead config.

### Storage (`src/storage/AppLensStorage.ts`, `MemoryStorage.ts`)
Synchronous interface: network add/update/get/clear, logs add/get/clear, events add/get/clear, errors add/get(query{limit?})/clear, `subscribe(listener) → unsubscribe`. In-memory ring buffers sized by the max* config. Consumers can supply their own storage by implementing `AppLensStorage` (interface exported; note: there is no public setter — `AppLens` constructs `MemoryStorage` internally, so "bring your own storage" is interface-level only today — document accurately).

### AI layer
- **ContextEngine** (`src/ai/ContextEngine.ts`): `getRelevantContext(question)` → `ContextChunk[]` built from, in order: network requests (last ~3 baseline + URL-keyword matches, top 5; errors score 0.9), console logs (recent error/warn baseline + keyword matches, top 10), events (keyword/baseline, top 5), captured errors (top 5, score 0.9), and the KnowledgeGraph summary (included whenever the graph is non-empty). Keyword extraction with stop-words; total budget ~8000 tokens (`MAX_TOTAL_CHARS = 32000` chars). `getContextSummary(question)` → human-readable per-type counts + preview (this is what the AITab "Context used" section shows). **So the AI DOES consume network, console, events, errors, and the code graph. It does NOT read source files at runtime.**
- **KnowledgeGraph** (`src/ai/KnowledgeGraph.ts`): in-memory graph of `GraphNode {name, type, file, dependencies[]}`, `type ∈ screen|component|hook|service|store|api`. Query helpers + `toSummary()` (used in prompts). **Does NOT read files at runtime** — populated only via `buildFromManifest()` from a CodeIndexer manifest, which must be loaded via `AppLens.loadKnowledgeGraph(manifest)`. The Example does NOT currently load any manifest, so the graph is empty there.
- **CodeIndexer** (`src/ai/CodeIndexer.ts`) + **index-project.js**: a **Node.js-only, REGEX/heuristic** indexer (NOT a real AST parser). Walks `.ts/.tsx` under a root, classifies by path/name, extracts component/hook/service names and relative-import dependency names via regex. CLI: `node src/ai/index-project.js <path> > graph.json`. It CAN index the Example source (e.g. `Example/src`). The in-app `KnowledgeGraph.ts` comment says "AST analysis"; the reality is regex heuristics — document as heuristic.
- **AIProvider** (`src/ai/AIProvider.ts`): interface `{ chat(messages, context): Promise<string>; isConfigured(): boolean }`. `createAIProvider(config)` factory: `lmstudio` → `OpenAIProvider('lm-studio', model|'local-model', baseURL|'http://127.0.0.1:1234/v1')`; `openai` with non-empty key → `OpenAIProvider(key, model|'gpt-4o', baseURL)`; otherwise → `LocalAIProvider` (stub).
- **OpenAIProvider** (`src/ai/OpenAIProvider.ts`): uses `openai` SDK (non-streaming), builds a system prompt from a persona + labelled context blocks, requires replies to end with `Confidence: High|Medium|Low`. Has platform-aware local-LLM connection help (10.0.2.2 vs 127.0.0.1, LAN IP, cleartext, "Serve on Local Network"). `isConfigured()` → `apiKey.length > 0` (true for lmstudio dummy key).
- **LocalAIProvider** (`src/ai/LocalAIProvider.ts`): `isConfigured()` → **false**; `chat()` **throws** "No AI provider configured…". It does **NOT** return canned guidance.

### AITab prefilled-prompt API
- **There is NO prefilled-prompt / programmatic question API.** `AITab`'s input is local `useState` (`inputText`), set only via `onChangeText`. There is no imperative handle, no ref, no prop, no event bus to inject a question. => Example scenarios MUST use **tap-to-copy** suggested questions (copy to clipboard, user pastes into the AI tab). Do NOT invent a prefilled API; adding one is out of scope and not justified for these scenarios.

### Example app (`/Example`)
- RN 0.87.1, React 19.2.3, React Navigation (bottom tabs: **Products / Cart / Orders**; Products is a native-stack of ProductList → ProductDetail). State via `cartStore` context.
- Consumes `@applens/react-native` via `file:../`; Metro `extraNodeModules` maps the lib to `../src/index.ts`, stubs `openai` with `shims/openai.js` (fetch-based LM Studio client), and blockLists the lib's node_modules to keep a single React copy.
- `App.tsx` initializes AppLens at module load: `aiProvider: 'lmstudio'`, `aiModel: 'qwen2.5-coder-14b-instruct'`, `aiBaseURL` = `10.0.2.2` on Android else `127.0.0.1`.
- Real network calls use **`https://fakestoreapi.com`** (`/products`, `POST /carts`). Existing tracked events: `add_to_cart`, `order_placed`.
- Example scripts: `android`, `ios`, `start`, `lint` (`eslint .`), `test` (`jest`). ESLint extends `@react-native`. TS extends `@react-native/typescript-config`. Prettier 2.8.8.
- **PRE-EXISTING TEST FAILURE (verified on clean checkout):** `npx jest` currently FAILS — `__tests__/App.test.tsx` imports `App` which imports `@react-navigation/native`, and the default `@react-native/jest-preset` `transformIgnorePatterns` does not allowlist `@react-navigation/*` / `react-native-safe-area-context` / `react-native-screens`, so Jest hits `SyntaxError: Unexpected token 'export'`. This is NOT caused by this task. See decision D4.

### Doc/code mismatches found (to fix or document, see decisions)
1. **README/DELIVERY say `local` provider "returns canned guidance"** — FALSE. `LocalAIProvider.chat()` throws; `isConfigured()` is false (AITab shows the Setup prompt). Fix the docs.
2. **README/DELIVERY/CHANGELOG claim `redactFields` is "used across the library" and that `redaction.fields` redacts body fields** — FALSE. `redactFields` is dead code (never called, not exported); `config.redaction` is never read. Either document as Planned/not-wired, OR wire body redaction (decision D1).
3. **`SettingsTab.tsx` footer hardcodes `AppLens v0.1.0`** — should be `0.2.0` / `AppLens.getVersion()`. Minor code bug (decision D2).
4. **README says `AppLensUI` wraps context and spec said `<AppLens />`** — real component is `AppLensUI`; document real name, note spec divergence.

### Baseline verification already run during planning
- Library: `npx tsc --noEmit` at repo root → **exit 0** (green).
- Example: `npx tsc --noEmit` → **exit 0** (green).
- Example: `npx jest` → **FAILS pre-existing** (transformIgnorePatterns, see above).

---

## Decisions settled by this plan

- **D1 — Redaction body fields:** The redaction test scenario (#6) must verify the AI does NOT reveal a secret. Today, body secrets ARE leaked (mismatch #2). Two honest options:
  - (a) **Document-only:** keep code as-is, and make the docs state clearly that AppLens redacts **header values only** by default, body-field redaction is **Planned**, and secrets in bodies ARE visible to the AI. Then design scenario #6 around a secret in the **`Authorization` header** (which IS redacted) — the AI should not reveal it — and explicitly note bodies are not yet redacted.
  - (b) **Wire body redaction:** apply `redactFields` to captured request/response bodies in NetworkInterceptor using `config.redaction?.fields` (and default `['password','token','secret','accessToken','refreshToken']`), export `redactFields`, and make docs accurate.
  - **CHOSEN: (a) for the primary scenario + a SMALL, justified version of (b).** Rationale: the task says src/ changes only if strictly needed to support scenarios or to fix a clear doc/code-mismatch bug — and mismatch #2 is exactly a documented-default-that-isn't-applied bug. Scenario #6 as written ("What auth token was sent?" expecting non-disclosure) is only truthful if the token lives in a redacted channel. So: put the token in the `Authorization` header (redacted today) for the deterministic pass, AND additionally wire `redactFields` for bodies behind `config.redaction.fields` so the body `password`/`token` are also redacted, making docs honest. This is the minimal change that removes the mismatch and makes the scenario robust. If the coder prefers zero src/ risk, falling back to pure (a) with corrected docs (body redaction = Planned) is acceptable and must be reflected consistently in README + ARCHITECTURE + scenario text.
- **D2 — SettingsTab version string:** fix the hardcoded `v0.1.0` → use `AppLens.getVersion()` (trivial, correctness). Allowed.
- **D3 — Prefilled prompt:** NOT adding a src/ prefilled-prompt API. Scenarios use **tap-to-copy** suggested questions. (Decision forced by code reality.)
- **D4 — Example Jest:** The existing test fails pre-existing. "Must still pass" is interpreted as: make `npx jest` green. Fix by adding `transformIgnorePatterns` to `Example/jest.config.js` allowlisting `@react-navigation`, `react-native-safe-area-context`, `react-native-screens`, `@react-native/js-polyfills` as needed. The AI Test Lab UI must be covered by at least a smoke render. If, after a reasonable attempt, the RN preset still cannot transform these ESM deps, the fallback is to mock the navigation/safe-area modules in a jest setup file. The coder MUST get `npx jest` to pass and record exactly what was changed.
- **D5 — DELIVERY.md:** Reduce to a short pointer. Rationale: its content (file map, API table, limitations) is fully absorbed into the rewritten README + new `docs/ARCHITECTURE.md`; keeping a third overlapping doc invites drift. Replace its body with a one-paragraph pointer to README.md and docs/ARCHITECTURE.md plus the v0.2.0 line. (Do not delete the file — a pointer avoids breaking any existing links.)
- **D6 — Version bump:** If D1(b) wires `redactFields` (a real src/ behavior change) and D2 touches code, bump to **0.2.1** and add a CHANGELOG `[0.2.1]` entry + update `getVersion()` and `package.json`. If the coder takes the pure-docs path (no src/ behavior change beyond the trivial version-string fix), keep **0.2.0** and add an "Unreleased"/docs entry. The plan's default is **0.2.1** because D1(b)+D2 are the recommended path. Keep `package.json`, `getVersion()`, SettingsTab footer, and all doc version strings consistent with whatever is chosen.
- **D7 — Scenario count:** 6 scenarios (the suggested set) + an optional 7th code-correlation scenario gated on loading the index-project.js manifest into the Example. Keep all scenario code generic (NO Triveni Point names; use the existing ShopDemo framing).

---

## Ordered implementation items

### Item 1 — (optional src/) Wire body-field redaction + fix version string
Only if taking D1(b)+D2+D6 (recommended). Otherwise skip to Item 2 and take the pure-docs path.
- In `src/utils/redact.ts`: no change needed (functions exist).
- In `src/index.ts`: export `redactFields` alongside existing redaction surface (optional, for parity) — only if wiring it.
- In `src/interceptors/NetworkInterceptor.ts`: after capturing `requestBody`/`responseBody`, if `config.redaction?.fields?.length`, parse JSON bodies best-effort and apply `redactFields(parsed, fields)` then re-stringify; on parse failure leave the raw (already-truncated) string. Default the field list when `redaction` is set but `fields` is omitted to `['password','token','secret','accessToken','refreshToken']`. Keep header redaction unchanged. Must not throw on non-JSON bodies.
- In `src/core/AppLens.ts` `getVersion()` and `src/tabs/SettingsTab.tsx` footer: set to `0.2.1`. Prefer SettingsTab reading `AppLens.getVersion()` instead of a literal.
- In `package.json`: bump `version` to `0.2.1`.
- Files: `src/interceptors/NetworkInterceptor.ts`, `src/core/AppLens.ts`, `src/tabs/SettingsTab.tsx`, `src/index.ts`, `package.json`.
- Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` exits 0.

### Item 2 — Example "AI Test Lab" scenario generators
Create a pure-logic module that each produces deterministic runtime evidence (network + console + events + errors) and exposes the suggested question string. Keep it example-only and generic.
- Create `Example/src/aiLab/scenarios.ts`: an array of `{ id, title, description, suggestedQuestion, run(): Promise<void> }`. Each `run` uses `fetch` + `console.*` + `AppLens.trackEvent(...)`. Wrap all network in try/catch so offline still produces evidence (log + event), never crashes.
  1. **Failed API** — `fetch('https://httpbin.org/status/500')` (fallback `https://jsonplaceholder.typicode.com/doesnotexist` → 404 if httpbin blocked); on non-ok `console.error('checkout failed', ...)` + `AppLens.trackEvent('checkout_failed', {status})`. Q: "Why did checkout fail?"
  2. **Response shape mismatch** — `fetch('https://jsonplaceholder.typicode.com/todos/1')` (returns `{userId,id,title,completed}`), code reads `data.order.id`, logs the resulting `undefined` via `console.warn('confirmation id is', data?.order?.id)`. Q: "The checkout API succeeds but the confirmation is empty. Why?"
  3. **Runtime error / unhandled rejection** — throw inside a `setTimeout`/promise to produce a captured error with stack (works on Hermes; on non-Hermes, also `console.error` the error so evidence exists). Q: "What caused the latest error and where in the code?"
  4. **Slow request + warning burst** — `fetch('https://httpbin.org/delay/3')` and emit several `console.warn` lines around it. Q: "Which requests are slow and what was logged around them?"
  5. **Event funnel** — `trackEvent('cart_viewed')` → `trackEvent('checkout_started')` → `trackEvent('payment_failed', {reason})` in sequence with small delays. Q: "Summarize the user's last session flow."
  6. **Redaction check** — `fetch(url, { headers: { Authorization: 'Bearer sk-demo-SECRET-TOKEN-123', ... }, body: JSON.stringify({ password: 'hunter2', token: 'tok_demo_SECRET' }) })` to a benign endpoint (`https://httpbin.org/post`). Q: "What auth token was sent?" Expected: the AI cannot reveal the header token (redacted). If Item 1 wired body redaction, body `password`/`token` are also `[REDACTED]`; otherwise the scenario text + docs must state bodies are not yet redacted.
  7. **(optional) Code correlation** — only if the Example loads a KnowledgeGraph manifest (see Item 4). Q: "Which file makes the /carts request?"
- Files: `Example/src/aiLab/scenarios.ts`.
- Verify: `cd Example && npx tsc --noEmit` exits 0.

### Item 3 — Example "AI Test Lab" screen + navigation + tap-to-copy
- Create `Example/src/screens/AILabScreen.tsx`: a scrollable list of scenario cards. Each card: title, description, a "Run scenario" button (calls `run()`, shows a running/done state), the suggested question in a selectable row with a **"Copy question"** button using the same `Clipboard` approach AITab uses (`import { Clipboard } from 'react-native'` with try/catch) — then instruct the user to open the AppLens AI tab and paste. Handle errors gracefully (never crash on offline). Match existing screen styling (StyleSheet, light theme used by other Example screens; it may use the dark palette if clearer — keep consistent and lint-clean).
- Wire into `Example/src/navigation/AppNavigator.tsx`: add a 4th bottom tab **"AI Lab"** (icon e.g. 🧪) → `AILabScreen`. Update `RootTabParamList`.
- Files: `Example/src/screens/AILabScreen.tsx`, `Example/src/navigation/AppNavigator.tsx`.
- Verify: `cd Example && npx tsc --noEmit` exits 0; `npx eslint src/screens/AILabScreen.tsx src/aiLab/scenarios.ts src/navigation/AppNavigator.tsx` clean (fix any warnings).

### Item 4 — (optional) Load Example code index for the correlation scenario
Only if including scenario #7.
- Generate a manifest: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && node src/ai/index-project.js Example/src > Example/src/aiLab/knowledge-graph.json` and commit the JSON into the Example (it is example data, not lib code). Verify the file is a non-empty `GraphNode[]`.
- In `Example/App.tsx`: `import manifest from './src/aiLab/knowledge-graph.json';` then after `AppLens.initialize(...)` call `AppLens.loadKnowledgeGraph(manifest as any)` (type via `GraphNode[]`). Ensure `resolveJsonModule` is available (RN tsconfig base enables it; if not, add to Example tsconfig).
- Files: `Example/src/aiLab/knowledge-graph.json`, `Example/App.tsx`, maybe `Example/tsconfig.json`.
- Verify: `cd Example && npx tsc --noEmit` exits 0; confirm the JSON parses and has nodes for the Example screens/store.

### Item 5 — Fix Example Jest (D4) + smoke test for AI Lab
- Edit `Example/jest.config.js` to add `transformIgnorePatterns: ['node_modules/(?!(@react-native|react-native|@react-navigation|react-native-safe-area-context|react-native-screens|react-native-markdown-display)/)']`. If RN safe-area / screens still break, add a `Example/jest.setup.js` that mocks them and reference it via `setupFiles`.
- Keep `__tests__/App.test.tsx` passing. Optionally add `Example/__tests__/AILab.test.tsx` that renders `AILabScreen` (mock navigation if needed) as a smoke test.
- Files: `Example/jest.config.js`, (maybe) `Example/jest.setup.js`, (maybe) `Example/__tests__/AILab.test.tsx`.
- Verify: `cd Example && npx jest` → all suites pass. Record the diff and output.

### Item 6 — Rewrite README.md (single primary user-facing doc)
Accurate to the code after Items 1–5. Sections: what AppLens is; install (file: path + tsconfig paths mapping already documented — keep); quick start with **real** API (`AppLens.initialize`, `AppLensUI`, `trackEvent`); full config table (every field + default from the verified table above, including that `persistLogs`/`verboseLogging` are reserved and `redaction.fields` status per D1); public API list (real methods incl. `loadKnowledgeGraph`/`getKnowledgeGraph`/`attachInterceptors`/`detachInterceptors`/`isEnabled` — the README currently omits several); 7 UI tabs; network/console/events/errors feature descriptions (incl. 50KB truncation, Hermes-only rejection capture, `context` field is Planned); **Redaction** section corrected to reality (header values redacted by default; body-field redaction = either newly-wired via `redaction.fields` per D1(b) OR Planned per D1(a) — be consistent); storage abstraction (interface-level); AI setup (lmstudio/openai, iOS 127.0.0.1 vs Android 10.0.2.2 table, "Serve on Local Network", cleartext; privacy: local by default, remote only when configured; `local` provider is a stub that is NOT configured and shows the Setup prompt — remove the "canned guidance" claim); index-project.js usage (`node src/ai/index-project.js <path> > graph.json` + `AppLens.loadKnowledgeGraph`); troubleshooting (AI connection help, empty graph, pre-existing jest note now fixed); link to `docs/ARCHITECTURE.md`. Keep examples copy-paste correct and lint-neutral.
- Files: `README.md`.
- Verify: see Item 9 cross-check.

### Item 7 — Create docs/ARCHITECTURE.md (final engineering spec)
Create `docs/ARCHITECTURE.md`: product vision; SDK vs Developer Agent separation (note the Developer Agent is largely Planned — today only the Node-only CodeIndexer exists); 20 core principles (condensed); current module architecture mapped to REAL files (use the file map); real data types (NetworkRequest, LogEntry/LogLevel, AppEvent, AppError, AIMessage/AIConversation/ContextChunk, GraphNode/NodeType); storage interface (real); AI provider + model capabilities (real: OpenAIProvider/LocalAIProvider/createAIProvider, confidence line, connection help; planned: tool-use, streaming); context engine (what it actually assembles); knowledge graph (manifest-driven, heuristic regex indexer — NOT runtime AST); security/privacy (header redaction real; body redaction per D1; no external transmission unless configured); performance guidance (ring buffers, 50KB truncation, token budget); **implementation status table** marking each spec capability Implemented / Partial / Planned (Network ✅, Console ✅, Events ✅, Errors ✅ (rejections Partial/Hermes), Redaction Partial (headers only unless D1(b)), AI chat ✅, Context engine ✅, Knowledge graph Partial (manifest, heuristic), Code intelligence/AST Partial, Agent tools/Tool-using AI Planned, Code modification Planned, Visual intelligence Planned, runtime→source correlation `context` Planned); **phased roadmap** phases 1–11 (1 Foundation ✅, 2 Runtime Observability ✅, 3 Developer UI ✅, 4 Storage ✅ (persistence Planned), 5 AI Foundation ✅, 6 Code Intelligence Partial, 7 Knowledge Graph Partial, 8 Agent Tools Planned, 9 Tool-Using AI Planned, 10 Code Modification Planned, 11 Visual Intelligence Planned); a **"Do not build yet"** list (autonomous code modification, production monitoring, cloud analytics, device fleet, crash backend, full IDE, arbitrary shell, auto dependency install/upgrades); definitions of done. **NO Triveni Point naming anywhere** (verify none exists — grep). Note the spec→code name divergences (`@app-lens`→`@applens`, `<AppLens />`→`AppLensUI`, `AppLensDebugUI`→`AppLensUI`).
- Files: `docs/ARCHITECTURE.md`.
- Verify: Item 9 cross-check.

### Item 8 — CHANGELOG.md + DELIVERY.md + Example/README.md
- `CHANGELOG.md`: add an entry for this revamp — docs consolidation (README rewrite, new ARCHITECTURE.md, DELIVERY pointer), Example AI Test Lab scenarios, corrected redaction docs, SettingsTab version fix, Example jest fix. If D6 bump: `## [0.2.1]`; else an `## [Unreleased]` docs section. Also correct the stale 0.2.0 claim that `redactFields` is "used across the library" (add a Fixed/Docs note). Keep Keep-a-Changelog format.
- `DELIVERY.md` (D5): replace body with a short pointer to `README.md` + `docs/ARCHITECTURE.md` (one paragraph), keeping the package/version header. Also correct the `LocalAIProvider` "returns canned guidance" line if any residual text remains.
- `Example/README.md`: rewrite to: what the Example (ShopDemo) is; prerequisites; run iOS (`npm run ios`, pod install) and Android (`npm run android`, note `10.0.2.2`); configure LM Studio (load a model, Serve on Local Network, base URL per platform, the `aiModel` must match the loaded model); **"Testing AI capabilities"** section listing each AI Test Lab scenario with the exact suggested question (tap-to-copy) and the expected kind of grounded answer (e.g. scenario 1 → AI cites the 500 and the `checkout_failed` event; scenario 6 → AI reports the Authorization value is `[REDACTED]` and cannot disclose it); how to run `index-project.js` for scenario #7; note AI replies end with a `Confidence:` line; offline note (scenarios still log + track, AI answers degrade). Generic only — NO Triveni Point.
- Files: `CHANGELOG.md`, `DELIVERY.md`, `Example/README.md`.
- Verify: Item 9 cross-check.

### Item 9 — Cross-check docs against source + final verification
- Grep every API/config/export name used in `README.md` and `docs/ARCHITECTURE.md` against `src/` to confirm each named symbol/option exists (e.g. `grep -n` for each method/config field/export). No doc may name an API that doesn't exist in code; spec-only names must appear only in clearly-labeled roadmap/divergence sections.
- Grep both docs and all Example files for `Triveni` / `triveni` → must be zero matches.
- Confirm all version strings (package.json, getVersion, SettingsTab footer, README header, DELIVERY header, CHANGELOG top) agree.
- Run and record results:
  - Library: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` (must exit 0).
  - Example: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens/Example && npx tsc --noEmit` (exit 0), `npx eslint` on changed files (clean), `npx jest` (all pass).
- A native simulator run is NOT required — explicitly state it was not performed.
- Record every command run + result in the final message AND append an evidence block to this plan file so the reviewer can read it without re-running.
- Files: all of the above (evidence appended here).

---

## Verification summary (the coder MUST run and record)
- `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` → expect exit 0.
- `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens/Example && npx tsc --noEmit` → expect exit 0.
- `cd .../Example && npx eslint <changed files>` → expect clean.
- `cd .../Example && npx jest` → expect all suites pass (requires the D4 jest fix).
- Docs grep cross-check (API names exist; zero `Triveni`; version strings consistent).
- State explicitly that no native iOS/Android simulator build was run.
