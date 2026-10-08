# AppLens

> `@applens/react-native` — v0.3.1

A developer-focused debugging, observability, and AI-analysis library for React Native applications. AppLens runs an in-app developer console where you inspect network requests, console logs, application events, and runtime errors, and where you can ask an AI assistant grounded questions about what your app actually did at runtime.

The console is a floating trigger button that opens a full-screen modal with seven tabs: **Overview, Network, Console, Events, Errors, AI, and Settings**.

AppLens is intentionally generic — it carries no assumptions about any particular host app. For the broader product vision, roadmap, and engineering spec, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Installation

### Add the dependency

AppLens is consumed as a **git-tag dependency over HTTPS**. Point your app's `package.json` at the tagged release:

```json
// package.json
{
  "dependencies": {
    "@applens/react-native": "git+https://github.com/SunilKuYadav/AppLens.git#v0.3.1"
  }
}
```

Then install:

```sh
npm install
# or
yarn install
```

On install, npm clones the tag and runs the package's `prepare` hook, which compiles the TypeScript sources to `dist/` automatically. You get compiled JavaScript plus type declarations — `main` points at `dist/index.js` and `types` at `dist/index.d.ts`. **No tsconfig path mapping is required**; types resolve automatically from `dist/index.d.ts`.

Runtime dependencies are `openai`, `react-native-markdown-display`, and `typescript` (the last is needed by the `prepare` build that runs at install time). `react` (>=18) and `react-native` (>=0.71) are peer dependencies.

> **Local library development.** If you are working on AppLens itself, run `npm run build` / `npm run type-check` in the package. The Example app consumes the same git tag; for a tighter edit loop you *may* use a `file:` dependency locally, but the git tag is the supported install path.

---

## Quick Start

```tsx
// App.tsx
import { useEffect } from 'react';
import { AppLens, AppLensUI } from '@applens/react-native';

const App = () => {
  useEffect(() => {
    AppLens.initialize({
      enabled: __DEV__,
      network: true,
      console: true,
      events: true,
      errors: true,
      ai: true,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <YourApp />
      {__DEV__ && <AppLensUI />}
    </SafeAreaProvider>
  );
};
```

Two pieces wire AppLens into your app:

- `AppLens.initialize(config)` — the singleton that attaches the interceptors and holds captured data. Call it once at startup. You can also call it at module load (before `useEffect`) if you want interceptors active before the first render.
- `<AppLensUI />` — the root UI component. It renders the floating trigger button, the full-screen modal, and the React context the tabs read from. Place it as the last child inside your root provider so it renders on top of all other UI.

> The product spec sketches a single `<AppLens />` component. The real API separates the data singleton (`AppLens`) from the UI component (`AppLensUI`). Use `AppLensUI` — see the divergence note in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## `AppLens.initialize(config)`

Call `AppLens.initialize(config)` once at app startup. It merges your partial config with the defaults. Calling it again updates the stored config (the Settings tab uses this at runtime) but does not recreate storage or re-attach interceptors that are already running.

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. When `false`, no interception or UI capture occurs. |
| `network` | `boolean` | `true` | Capture network requests (XHR / fetch). |
| `console` | `boolean` | `true` | Capture `console.log/info/warn/error/debug` output. |
| `events` | `boolean` | `true` | Enable the `AppLens.trackEvent()` API. |
| `errors` | `boolean` | `true` | Capture uncaught errors and (on Hermes) unhandled promise rejections. |
| `ai` | `boolean` | `true` | Enable the AI tab and AI analysis features. |
| `aiProvider` | `'openai' \| 'lmstudio' \| 'local'` | `'openai'` | Which AI backend to use. |
| `aiApiKey` | `string` | `undefined` | API key for the AI provider (never logged). Not required for `lmstudio`/`local`. |
| `aiModel` | `string` | `undefined` | Model identifier, e.g. `'gpt-4o'` for OpenAI or the model name shown in LM Studio. |
| `aiBaseURL` | `string` | `undefined` | Override the AI provider base URL (e.g. `http://127.0.0.1:1234/v1` for LM Studio). |
| `redactHeaders` | `string[]` | built-in list | Header names whose **values** are replaced with `[REDACTED]` in network logs. Default list below. |
| `redaction` | `{ headers?: string[]; fields?: string[] }` | `undefined` | Structured redaction. When set, request/response JSON **body** fields named in `fields` are redacted (case-insensitive). See [Redaction](#redaction). |
| `projectRoot` | `string` | `undefined` | Absolute path to the host project root. Reserved for future in-app indexing; not read at runtime today. |
| `maxNetworkEntries` | `number` | `500` | Maximum number of network requests kept in memory (ring buffer). |
| `maxLogEntries` | `number` | `1000` | Maximum number of console log entries kept in memory (ring buffer). |
| `maxEventEntries` | `number` | `500` | Maximum number of tracked events kept in memory (ring buffer). |
| `persistLogs` | `boolean` | `false` | **Reserved / not yet implemented.** The flag exists but no persistence happens — all data is in-memory. |
| `verboseLogging` | `boolean` | `false` | **Reserved / unused today.** Declared in config but not currently consumed. |

The default `redactHeaders` list is: `authorization`, `cookie`, `x-api-key`, `x-auth-token`, `x-access-token`, `x-secret`.

### Example

```ts
AppLens.initialize({
  enabled: __DEV__,
  network: true,
  console: true,
  events: true,
  errors: true,
  ai: true,
  aiProvider: 'openai',
  aiApiKey: process.env.OPENAI_API_KEY,
  aiModel: 'gpt-4o',
  redactHeaders: ['Authorization', 'x-api-key'],
  redaction: {
    fields: ['password', 'token'],
  },
  maxNetworkEntries: 300,
});
```

---

## Public API

`AppLens` is a singleton object (not a component). Its methods:

```ts
import { AppLens } from '@applens/react-native';

AppLens.initialize(config);              // configure and start AppLens
AppLens.trackEvent(name, props?);        // record a custom event
AppLens.isEnabled();                     // true when initialized and enabled
AppLens.getVersion();                    // '0.3.1'
AppLens.getConfig();                     // read-only copy of the active config
AppLens.getStorage();                    // the shared AppLensStorage instance
AppLens.loadKnowledgeGraph(manifest);    // load a GraphNode[] source manifest
AppLens.getKnowledgeGraph();             // the current KnowledgeGraph instance
AppLens.attachInterceptors();            // (re)attach interceptors per current config
AppLens.detachInterceptors();            // detach all interceptors (keep config)
AppLens.reset();                         // detach, clear all data, mark uninitialized
```

### `AppLens.trackEvent(name, properties?)`

```ts
AppLens.trackEvent('checkout_started', {
  productId: '123',
  amount: 499,
  currency: 'USD',
});
```

No-op when AppLens is disabled or events are turned off. Each event is stored as an `AppEvent`:

```ts
interface AppEvent {
  id: string;
  name: string;
  timestamp: number;              // Unix ms
  properties?: Record<string, unknown>;
}
```

### `AppLens.attachInterceptors()` / `AppLens.detachInterceptors()`

`attachInterceptors()` starts the interceptors enabled in the current config and stops the ones that are disabled; `detachInterceptors()` stops all of them without touching config. The Settings tab calls these so runtime toggles take effect without an app restart.

### `AppLens.loadKnowledgeGraph(manifest)` / `AppLens.getKnowledgeGraph()`

`loadKnowledgeGraph()` replaces the in-memory knowledge graph with one built from a `GraphNode[]` manifest produced by the Code Indexer (see [Code intelligence](#code-intelligence-knowledge-graph)). `getKnowledgeGraph()` returns the current `KnowledgeGraph`. The graph is empty until a manifest is loaded.

### `AppLens.reset()`

Detaches all interceptors (network, console, errors), clears every data store (network requests, logs, events, errors), and marks AppLens uninitialized. A subsequent `initialize()` call starts fresh.

### `AppLens.getVersion()`

Returns the library version string (`'0.3.1'`).

---

## `<AppLensUI />` Component

Renders the floating trigger button and the full-screen debug modal together, and provides the React context the tabs read from.

```tsx
{__DEV__ && <AppLensUI />}
```

No props required — all configuration is handled via `AppLens.initialize()`. The modal contains the following tabs:

| Tab | What it shows |
|---|---|
| **Overview** | Summary of the current debugging state: network request counts, console log counts, event count, error total/fatal counts, and the AppLens library version. |
| **Network** | List of captured HTTP requests with method, URL, status, and duration. Tap a request for full detail: URL, method, headers, query params, request body, response headers, response body, and error info. Searchable, filterable, clearable. |
| **Console** | Captured console output (`log`, `info`, `warn`, `error`, `debug`). Searchable and level-filterable. Tap a log for full detail including stack trace. |
| **Events** | Custom events sent via `AppLens.trackEvent()`. Searchable, filterable, and clearable. |
| **Errors** | Uncaught errors and (on Hermes) unhandled promise rejections. Each row shows the timestamp, message, and a fatal/non-fatal badge; tap to expand the full stack trace. Searchable and clearable. |
| **AI** | Conversational AI assistant with context of the application's runtime state and (when a manifest is loaded) its source structure. Each reply shows a collapsible "Context used" section, a Confidence badge, and a Copy button. |
| **Settings** | Toggle AppLens features on/off at runtime without restarting the app. |

If you need finer placement control, `AppLensProvider` (with the `useAppLens()` hook), `AppLensTrigger`, and `AppLensModal` are exported separately.

---

## Network Inspection

When `network: true` (the default), AppLens installs a `NetworkInterceptor` that monkey-patches the global `XMLHttpRequest` and `fetch`. Each captured request is stored as a `NetworkRequest`:

```ts
interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;    // truncated to 50 KB
  responseBody?: string;   // truncated to 50 KB
  duration?: number;       // ms
  timestamp: number;       // Unix ms
  error?: { message: string; code?: string; stack?: string };
  state: 'pending' | 'complete' | 'error';
  context?: NetworkRequestContext;  // see note below
}
```

- Request and response bodies are truncated to **50 KB** before storage.
- Sensitive header values are redacted — see [Redaction](#redaction).
- `NetworkRequest.context` (screen / hook / service / event that triggered the request) is **declared but not populated today.** Runtime→source correlation is on the roadmap; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Console Inspection

When `console: true`, a `ConsoleInterceptor` overrides `console.log/info/warn/error/debug` and stores each call as a `LogEntry`:

```ts
type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  args: unknown[];
  timestamp: number;   // Unix ms
  stack?: string;
}
```

The Console tab is searchable and level-filterable, with per-entry detail (including the captured stack) and copy.

---

## Event Tracking

When `events: true`, `AppLens.trackEvent(name, properties?)` records a structured `AppEvent` (shown above). Events appear in the Events tab and are available to the AI assistant as context.

---

## Error Collection

When `errors: true` (the default), AppLens installs an `ErrorInterceptor` that:

- Captures uncaught JavaScript errors via React Native's `ErrorUtils` global handler, then calls the original handler so your app's normal error flow is preserved.
- Captures unhandled promise rejections as non-fatal errors **when the Hermes rejection tracker is available.** On runtimes without it, rejection capture is a no-op (uncaught errors are still captured).

Captured errors use the `AppError` type:

```ts
interface AppError {
  id: string;
  message: string;
  stack?: string;
  timestamp: number;   // Unix ms
  isFatal: boolean;
}
```

They appear in the Errors tab, feed the Overview error counts, and are available to the AI assistant as context.

---

## Redaction

AppLens redacts secrets before captured data is stored or shown. Redaction runs in two layers:

**1. Header values (always on by default).** The `redactHeaders` list controls which request/response header values are replaced with `[REDACTED]`. The default list covers common auth headers (`authorization`, `cookie`, `x-api-key`, `x-auth-token`, `x-access-token`, `x-secret`). Override it to add your own:

```ts
AppLens.initialize({
  redactHeaders: ['Authorization', 'x-session-id', 'x-device-token'],
});
```

**2. Body fields (opt-in via `redaction`).** When you set the `redaction` option, JSON request and response **bodies** are best-effort parsed and any field named in `redaction.fields` (case-insensitive, at any depth) is replaced with `[REDACTED]` before storage. If `redaction` is set but `fields` is omitted, AppLens defaults to `['password', 'token', 'secret', 'accessToken', 'refreshToken']`. Non-JSON bodies and parse failures are left as the (already 50 KB-truncated) raw string — redaction never throws.

```ts
AppLens.initialize({
  redaction: {
    fields: ['password', 'secret', 'accessToken'],
  },
});
```

Body-field redaction was wired in **v0.2.1**. Redaction is implemented by the exported `redactHeaders` / `redactFields` utilities; both return a fresh value and never mutate their input.

> Note: `redaction.headers` is accepted by the type, but header redaction is driven by the top-level `redactHeaders` option today. Use `redactHeaders` to add header names.

---

## AI Configuration

The AI tab is backed by a pluggable provider selected with `aiProvider`:

```ts
AppLens.initialize({
  ai: true,
  aiProvider: 'openai',   // 'openai' | 'lmstudio' | 'local'
  aiApiKey: 'sk-...',     // required for OpenAI
  aiModel: 'gpt-4o',      // model identifier
  aiBaseURL: undefined,   // override for LM Studio / self-hosted endpoints
});
```

- **openai** — uses the OpenAI API via `OpenAIProvider`; requires a non-empty `aiApiKey`.
- **lmstudio** — points `OpenAIProvider` at a local LM Studio server via `aiBaseURL` (default `http://127.0.0.1:1234/v1`); no API key required.
- **local** — `LocalAIProvider`, an **unconfigured stub**. Its `isConfigured()` returns `false` and `chat()` throws, so the AI tab shows a setup prompt directing you to configure a provider. It does **not** return canned answers.

If `aiProvider` is `'openai'` but no API key is set, the factory falls back to the `local` stub — so the tab prompts you to finish AI setup rather than silently doing nothing.

### Connecting to a local LLM (LM Studio)

When running against a local LM Studio server, the correct base URL depends on where the app runs. On an Android emulator, `127.0.0.1` refers to the emulator itself — not your computer — so the emulator must reach the host via `10.0.2.2`.

| Platform | Base URL |
| --- | --- |
| iOS simulator | `http://127.0.0.1:1234/v1` |
| Android emulator | `http://10.0.2.2:1234/v1` |
| Physical device | `http://<your-computer-LAN-IP>:1234/v1` |

- In LM Studio, load a model and enable **"Serve on Local Network"** so the server binds `0.0.0.0` rather than only localhost. Without this, emulator and device connections fail even with the right base URL.
- `aiModel` must match the model loaded in LM Studio.
- Android debug builds may need cleartext `http` traffic allowed (ensure `usesCleartextTraffic` is enabled in the debug manifest).

Android emulator example:

```ts
AppLens.initialize({
  ai: true,
  aiProvider: 'lmstudio',
  aiModel: 'qwen2.5-coder-14b-instruct',
  aiBaseURL: 'http://10.0.2.2:1234/v1',
});
```

> **Security note:** Never hard-code your API key in source control. Use environment variables or a secrets manager and inject the key at build time. API keys are never written to logs. By default AppLens keeps everything local — data is only sent to a remote endpoint when you explicitly configure the `openai` provider.

### AI context and code awareness

AppLens AI is not a generic chatbot. A `ContextEngine` assembles structured context for each question from:

- Captured network requests and responses
- Console log history
- Tracked events
- Captured runtime errors
- The Application Knowledge Graph summary (when a manifest is loaded)

Chunks are selected by keyword + recency ranking and kept under an ~8000-token budget. The engine does **not** read source files at runtime. Each AI reply ends with a line formatted as `Confidence: High | Medium | Low`, which the UI parses into a colored badge.

### Code intelligence (knowledge graph)

AppLens can correlate runtime activity with your source structure using a pre-built knowledge graph. The Code Indexer is a Node-only tool that scans your `.ts`/`.tsx` files and emits a `GraphNode[]` manifest. There are two variants:

- **Regex indexer** (`index-project.js`) — the original heuristic scanner.
- **AST indexer** (`index-project-ast.js`) — uses the TypeScript compiler API, so it correctly ignores doc comments and names real exports instead of falling back to filename basenames. More accurate; prefer it.

After a git-tag install the compiled CLIs live under `dist/ai/`:

```sh
# AST variant (recommended)
node node_modules/@applens/react-native/dist/ai/index-project-ast.js path/to/your/src > graph.json

# regex variant
node node_modules/@applens/react-native/dist/ai/index-project.js path/to/your/src > graph.json
```

Load the manifest at startup:

```ts
import graph from './graph.json';
import { AppLens, GraphNode } from '@applens/react-native';

AppLens.loadKnowledgeGraph(graph as GraphNode[]);
```

Both indexers classify files as screen/component/hook/service/store/api, extract top-level entity names, and derive dependencies from relative imports. The regex variant is best-effort; the AST variant resolves declarations and imports through the compiler for a more precise map.

---

## Architecture

```
                 AppLens UI (AppLensUI)
   Overview | Network | Console | Events | Errors | AI | Settings
                           │
                     AppLens (singleton)
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                   ↓
   Interceptors         Storage            AI layer
   (Network,         (AppLensStorage       (ContextEngine,
    Console,          interface,            AIProvider,
    Error)            MemoryStorage         KnowledgeGraph)
                      ring buffer)
```

Source layout:

```
@applens/react-native
└── src/
    ├── core/
    │   ├── AppLens.ts          # Singleton — initialize/trackEvent/reset/getVersion/getters,
    │   │                       #   loadKnowledgeGraph, attach/detachInterceptors
    │   ├── AppLensConfig.ts    # AppLensConfig type and DEFAULT_CONFIG
    │   ├── AppLensProvider.tsx # React context provider + useAppLens() hook
    │   └── AppLensUI.tsx       # Root component (provider + trigger + modal)
    ├── interceptors/
    │   ├── NetworkInterceptor.ts  # Patches global XHR and fetch; redacts headers + body fields
    │   ├── ConsoleInterceptor.ts  # Overrides global console methods
    │   └── ErrorInterceptor.ts    # ErrorUtils handler + Hermes rejection tracker
    ├── storage/
    │   ├── AppLensStorage.ts   # Synchronous storage interface
    │   └── MemoryStorage.ts    # In-memory ring-buffer implementation
    ├── components/             # AppLensModal, AppLensTrigger, Badge, JSONViewer, …
    ├── tabs/                   # OverviewTab, NetworkTab, ConsoleTab, EventsTab,
    │                           #   ErrorsTab, AITab, SettingsTab, NetworkDetailScreen
    ├── ai/
    │   ├── AIProvider.ts       # AIProvider interface + createAIProvider() factory
    │   ├── OpenAIProvider.ts
    │   ├── LocalAIProvider.ts  # unconfigured stub (chat() throws)
    │   ├── KnowledgeGraph.ts
    │   ├── ContextEngine.ts
    │   ├── CodeIndexer.ts      # Node-only regex/heuristic indexer
    │   ├── index-project.js    # CLI wrapper around CodeIndexer
    │   ├── AstCodeIndexer.ts   # Node-only AST indexer (TypeScript compiler API)
    │   └── index-project-ast.js # CLI wrapper around AstCodeIndexer
    ├── types/                  # NetworkTypes, LogTypes, EventTypes, ErrorTypes, AITypes
    ├── utils/
    │   └── redact.ts           # redactHeaders / redactFields
    └── index.ts                # Public API barrel
```

Storage is synchronous (methods return values/arrays, not Promises) and backed by an in-memory ring buffer that evicts the oldest entries. `AppLensStorage` is exported as an interface so you can read it via `AppLens.getStorage()`; there is no public setter to swap the implementation today.

For the full engineering spec, implementation-status table, phased roadmap, and the "Do not build yet" list, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Exports

Values: `AppLens`, `AppLensProvider`, `useAppLens`, `AppLensUI`, `AppLensModal`, `AppLensTrigger`, `redactHeaders`, `redactFields`, `createAIProvider`, `OpenAIProvider`, `LocalAIProvider`, `KnowledgeGraph`, `ContextEngine`.

Types: `AppLensConfig`, `NetworkRequest`, `LogEntry`, `LogLevel`, `AppEvent`, `AppError`, `AIMessage`, `AIConversation`, `ContextChunk`, `AppLensStorage`, `AIProvider`, `GraphNode`, `NodeType`.

---

## Known Limitations

- **Promise-rejection capture depends on Hermes.** Unhandled rejection tracking uses the Hermes rejection tracker when available; on other engines it is a no-op (uncaught errors are still captured via `ErrorUtils`).
- **`persistLogs` and `verboseLogging` are reserved.** Both flags exist in the config but are not consumed yet — all data is in-memory and cleared on reload.
- **The `local` AI provider is a stub.** Without `aiApiKey` (OpenAI) or an `aiBaseURL` (LM Studio), the AI tab falls back to the `local` provider, which shows a setup prompt (it does not answer).
- **`NetworkRequest.context` is not populated.** Runtime→source correlation is planned, not implemented.
- **Code Indexer is Node-only.** The CLIs (`dist/ai/index-project.js` regex, `dist/ai/index-project-ast.js` AST) run as build-time tools; the in-app AI draws on the pre-built manifest and live runtime context rather than re-indexing on-device.
- **No automated test suite in the library.** Verification is `npx tsc --noEmit` (strict type-check). (The Example app has Jest tests.)

---

## Releasing (maintainers)

Releases are automated through the npm `version` lifecycle. `package.json` is the single source of truth for the version. To cut a release:

```sh
npm version patch   # or minor | major
```

This runs, in order:

1. `preversion` — `npm run type-check` (aborts the release if types don't pass).
2. the version bump in `package.json`.
3. `version` — `npm run sync-version` (rewrites the hardcoded `getVersion()` string in `src/core/AppLens.ts` to match `package.json` via `scripts/sync-version.js`), then stages that file.
4. the version commit and the `vX.Y.Z` git tag.
5. `postversion` — `git push --follow-tags` (pushes the branch and the tag).

Consumers then bump their git-tag ref, e.g. `#v0.3.1` → `#v0.3.2`, and reinstall so the new tag is cloned and `prepare` rebuilds `dist/`.

---

## License

MIT
