# AppLens — Engineering Specification & Architecture

> `@applens/react-native` — v0.2.1

This document is the engineering reference for AppLens: the product vision, the real module architecture as it exists today, and an honest roadmap of what is Implemented, Partial, and Planned. It is the companion to the user-facing [README.md](../README.md).

AppLens is a **generic** React Native developer tool. It carries no assumptions about any specific host application, API, or business domain, and must stay that way.

---

## 1. Product Vision

AppLens aims to answer, for a running React Native app:

> **"What is happening inside my application, why is it happening, where is the problem in my code, and how can I fix it?"**

It combines runtime observability (network, console, events, errors) with code intelligence (a source knowledge graph) and AI reasoning grounded in both. The long-term differentiator is an assistant that understands not just the codebase but the *running application*, correlating runtime behaviour with source.

Much of that vision is still ahead of the code. This document is explicit about where the line sits today.

---

## 2. System Architecture: SDK vs Developer Agent

The spec describes two cooperating parts:

```
┌───────────────────────────────────────┐
│          React Native App             │
│       @applens/react-native (SDK)     │
│ Network / Console / Events / Errors   │
│ Runtime data + Developer UI + AI tab  │
└──────────────────┬────────────────────┘
                   │  (future) local connection
                   ↓
┌───────────────────────────────────────┐
│       AppLens Developer Agent         │
│ Project scan / AST / Git / Tools      │
│ Context engine / Editing (PLANNED)    │
└──────────────────┬────────────────────┘
                   ↓
              Local AI Model
```

**Today, only the SDK side exists.** The "Developer Agent" is almost entirely Planned. The only developer-machine component that ships is the Node-only **Code Indexer** (`src/ai/CodeIndexer.ts` + `src/ai/index-project.js`), a build-time script that emits a source manifest. There is no running agent process, no filesystem bridge from the device, no git integration, and no code modification. The RN runtime never gets direct filesystem access.

---

## 3. Core Principles (condensed)

1. Keep modules small and separable; keep RN integration trivial (`initialize` + `<AppLensUI />`).
2. Separate runtime concerns (SDK) from developer-machine concerns (indexer/agent).
3. Keep the AI provider and model runtime replaceable behind the `AIProvider` interface.
4. Local and private by default; never send app data externally unless explicitly configured.
5. Never expose secrets by default (header + body redaction).
6. Read-only first; code modification requires explicit approval and is not built yet.
7. Avoid unnecessary dependencies and over-engineering.
8. Prefer interfaces/adapters; prefer code-graph analysis, with semantic search as a future complement.
9. Keep public APIs stable; every major capability must be testable.
10. AppLens must not become a performance problem. Never claim a fix without verification.

---

## 4. Current Module Architecture (real files)

| Area | Files | Responsibility |
|---|---|---|
| Core | `core/AppLens.ts`, `core/AppLensConfig.ts`, `core/AppLensProvider.tsx`, `core/AppLensUI.tsx` | Singleton lifecycle, config + defaults, React context/hook, root UI component |
| Interceptors | `interceptors/NetworkInterceptor.ts`, `ConsoleInterceptor.ts`, `ErrorInterceptor.ts` | Monkey-patch XHR+fetch, `console.*`, `ErrorUtils`/Hermes rejection tracker |
| Storage | `storage/AppLensStorage.ts`, `storage/MemoryStorage.ts` | Synchronous storage interface + in-memory ring buffer with subscribe/notify |
| UI | `components/*`, `tabs/*` | Modal, trigger, JSON viewer, 7 tabs |
| AI | `ai/AIProvider.ts`, `OpenAIProvider.ts`, `LocalAIProvider.ts`, `ContextEngine.ts`, `KnowledgeGraph.ts`, `CodeIndexer.ts`, `index-project.js` | Provider interface + factory, context assembly, knowledge graph, Node indexer |
| Types | `types/NetworkTypes.ts`, `LogTypes.ts`, `EventTypes.ts`, `ErrorTypes.ts`, `AITypes.ts` | Shared data types |
| Utils | `utils/redact.ts` | `redactHeaders` / `redactFields` |

---

## 5. Data Types

All types below exist in `src/types/` (except graph types, in `src/ai/KnowledgeGraph.ts`) and are exported from `src/index.ts`.

```ts
// NetworkTypes.ts
interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;   // truncated to 50 KB, redacted
  responseBody?: string;  // truncated to 50 KB, redacted
  duration?: number;
  timestamp: number;
  error?: { message: string; code?: string; stack?: string };
  state: 'pending' | 'complete' | 'error';
  context?: NetworkRequestContext;  // declared, NOT populated today
}

// LogTypes.ts
type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
interface LogEntry { id; level: LogLevel; message; args: unknown[]; timestamp; stack?; }

// EventTypes.ts
interface AppEvent { id; name; timestamp; properties?: Record<string, unknown>; }

// ErrorTypes.ts
interface AppError { id; message; stack?; timestamp; isFatal: boolean; }

// AITypes.ts
type AIProviderType = 'openai' | 'lmstudio' | 'local';
interface AIMessage { id; role: 'user' | 'assistant' | 'system'; content; timestamp; }
interface AIConversation { messages: AIMessage[]; }
interface ContextChunk { type: 'network' | 'log' | 'event' | 'graph' | 'code'; content: string; relevanceScore: number; }

// KnowledgeGraph.ts
type NodeType = 'screen' | 'component' | 'hook' | 'service' | 'store' | 'api';
interface GraphNode { name: string; type: NodeType; file: string; dependencies: string[]; }
```

---

## 6. Storage

`AppLensStorage` is a synchronous interface (no Promises):

```ts
interface AppLensStorage {
  addNetworkRequest(r: NetworkRequest): void;
  updateNetworkRequest(id: string, updates: Partial<NetworkRequest>): void;
  getNetworkRequests(): NetworkRequest[];
  clearNetworkRequests(): void;
  addLog(e: LogEntry): void;   getLogs(): LogEntry[];   clearLogs(): void;
  addEvent(e: AppEvent): void; getEvents(): AppEvent[]; clearEvents(): void;
  addError(e: AppError): void; getErrors(query?: { limit?: number }): AppError[]; clearErrors(): void;
  subscribe(listener: () => void): () => void;
}
```

`MemoryStorage` implements it as a ring buffer sized from `maxNetworkEntries` / `maxLogEntries` / `maxEventEntries`, evicting oldest entries and notifying subscribers on every mutation. The storage instance is readable via `AppLens.getStorage()`. There is **no public setter** to swap storage today — custom persistence is a future extension point.

---

## 7. AI Layer

### Providers (real)

- `AIProvider` — interface with `chat(messages, context)` and `isConfigured()`.
- `createAIProvider(config)` — factory. `'lmstudio'` → `OpenAIProvider` pointed at the LM Studio base URL with a dummy key; `'openai'` with a non-empty key → `OpenAIProvider`; otherwise → `LocalAIProvider`.
- `OpenAIProvider` — OpenAI-compatible client. Its system prompt instructs the model to end every answer with a line formatted exactly as `Confidence: High | Medium | Low`, which the AI tab parses into a badge.
- `LocalAIProvider` — an **unconfigured stub**: `isConfigured()` returns `false` and `chat()` throws. It exists so the AI tab can show a setup prompt when no backend is configured. It does **not** generate canned guidance.

Platform-aware connection help (iOS `127.0.0.1` vs Android emulator `10.0.2.2`, "Serve on Local Network", cleartext http) is documented in the README's AI section.

### Planned (not built)

- Tool-use / function calling, streaming responses, on-device inference, and multi-provider routing beyond the current factory.

### Context Engine (real)

`ContextEngine.getRelevantContext(question)` assembles `ContextChunk[]` from:

- Network requests (recent + URL-keyword matches; error requests ranked higher)
- Console logs (recent errors/warns + keyword matches)
- Tracked events (recent + keyword matches)
- Captured errors (recent, high relevance)
- The knowledge graph summary (included when populated)

Chunks are ranked by `relevanceScore` (keyword + recency heuristics) and truncated to fit an ~8000-token budget (`MAX_TOTAL_CHARS = 8000 * 4` chars). It does **not** read source files at runtime; code awareness comes only from the pre-loaded knowledge graph summary.

### Knowledge Graph & Code Intelligence

`KnowledgeGraph` is manifest-driven: it starts empty and is populated via `KnowledgeGraph.buildFromManifest(nodes)` / `AppLens.loadKnowledgeGraph(nodes)`. It supports `findByName`, `findDependencies`, `findDependents`, and `toSummary()` (grouped by node type for AI prompts).

The manifest is produced by `CodeIndexer.indexProject(dir)` (via `index-project.js`). The indexer is a **regex/heuristic** scanner — despite older prose that called it "AST", it does not build an AST. It walks `.ts`/`.tsx` files, classifies each by path/name into a `NodeType`, extracts top-level entity names with regexes, and derives dependencies from relative import paths. Output quality is best-effort, not a precise call graph.

---

## 8. Security & Privacy

- **Local by default.** No data leaves the device unless you configure the `openai` provider (or any remote `aiBaseURL`).
- **Header redaction** is always on via `redactHeaders` (default auth-header list).
- **Body-field redaction** (v0.2.1) redacts JSON body fields named in `redaction.fields` (default `['password','token','secret','accessToken','refreshToken']` when `redaction` is set without `fields`). Redaction is best-effort and never throws.
- **API keys are never logged** and should be injected from env/secrets, never committed.

---

## 9. Performance Guidance

- Ring-buffer storage caps memory with per-store maximums.
- Request/response bodies are truncated to **50 KB** before storage.
- The context engine enforces an **~8000-token** budget per question.
- Interceptors preserve original behaviour (console/fetch/XHR/ErrorUtils are called through) so AppLens stays transparent to the app.

---

## 10. Implementation Status

| Capability | Status | Notes |
|---|---|---|
| Network capture (XHR + fetch) | **Implemented** | 50 KB body truncation, timing, headers, state |
| Console capture | **Implemented** | all five levels, stack, args |
| Event tracking | **Implemented** | `trackEvent` + Events tab |
| Error capture (uncaught) | **Implemented** | via `ErrorUtils`, preserves original handler |
| Unhandled-rejection capture | **Partial** | Hermes only; no-op on other engines |
| Header redaction | **Implemented** | `redactHeaders`, on by default |
| Body-field redaction | **Implemented** | opt-in via `redaction.fields` (v0.2.1) |
| Developer UI (7 tabs, dark, search/filter) | **Implemented** | |
| AI chat (OpenAI / LM Studio) | **Implemented** | Confidence line + "Context used" |
| Context engine | **Implemented** | runtime context + graph summary, token-budgeted |
| Knowledge graph | **Partial** | manifest-driven; empty unless loaded |
| Code intelligence (indexer) | **Partial** | Node-only, regex/heuristic, not AST |
| Runtime→source correlation (`NetworkRequest.context`) | **Planned** | field declared, not populated |
| AI tool-use / function calling | **Planned** | |
| Streaming AI responses | **Planned** | |
| Developer Agent (filesystem/git/tools) | **Planned** | only the Node indexer exists |
| Code modification | **Planned** | |
| Visual intelligence (screenshots) | **Planned** | |

---

## 11. Phased Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 — Foundation | Package, config, singleton, storage interface | **Done** |
| 2 — Runtime Observability | Network, console, events, errors | **Done** |
| 3 — Developer UI | Modal, trigger, 7 tabs, search/filter | **Done** |
| 4 — Storage | In-memory ring buffer | **Done** (persistence Planned) |
| 5 — AI Foundation | Provider interface, OpenAI/LM Studio, context engine, confidence | **Done** |
| 6 — Code Intelligence | Source indexing | **Partial** (regex/heuristic, Node-only) |
| 7 — Knowledge Graph | Entity/dependency graph + AI summary | **Partial** (manifest-driven) |
| 8 — Agent Tools | Filesystem, search, git, diagnostics | **Planned** |
| 9 — Tool-Using AI | Function calling, retrieval tools | **Planned** |
| 10 — Code Modification | Approval-gated edits, verification | **Planned** |
| 11 — Visual Intelligence | Screenshots / UI context | **Planned** |

---

## 12. Do Not Build Yet

Explicitly out of scope until the earlier phases are solid:

- Autonomous / unattended code modification
- Production monitoring or always-on telemetry
- Cloud analytics or any remote data backend
- Device-fleet management
- A hosted crash-reporting backend
- A full in-app IDE
- Arbitrary shell execution from the agent
- Automatic dependency installation or upgrades

---

## 13. Definitions of Done

- Library `npx tsc --noEmit` exits 0.
- Every documented API/config/export exists in `src/` (grep-verified).
- No capability is described as more complete than it is (statuses above are honest).
- No host-app-specific naming or logic anywhere in `src/` or docs.
- Version strings agree across `package.json`, `getVersion()`, `SettingsTab`, README, DELIVERY, and CHANGELOG.

---

## 14. Spec-vs-Code Divergence

The product spec uses some names the code does not. The code is the source of truth; document the real names and note the divergence here. **Do not rename code to match the spec.**

| Spec name | Real name in code | Notes |
|---|---|---|
| `@app-lens/react-native` | `@applens/react-native` | package name |
| `<AppLens />` (single component) | `AppLens` singleton + `<AppLensUI />` | data vs UI are separate |
| `AppLensDebugUI` | `AppLensUI` | root UI component |

Individual pieces (`AppLensProvider`, `useAppLens`, `AppLensTrigger`, `AppLensModal`) are also exported for custom placement.
