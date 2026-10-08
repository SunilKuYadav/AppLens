# AppLens

> `@applens/react-native` — v0.2.0

A developer-focused debugging and observability library for React Native applications. AppLens provides an in-app developer console where you can inspect network requests, console logs, application events, runtime errors, and get AI-powered analysis of your application's runtime behaviour and source code.

The console is a floating trigger button that opens a full-screen modal with seven tabs: **Overview, Network, Console, Events, Errors, AI, and Settings**.

---

## Installation

### 1. Add the dependency

For local development (file path):

```json
// package.json
{
  "dependencies": {
    "@applens/react-native": "file:../AppLens"
  }
}
```

Then install:

```sh
npm install
# or
yarn install
```

AppLens ships raw TypeScript (no build step). Its only runtime dependencies are `openai` and `react-native-markdown-display`. `react` (>=18) and `react-native` (>=0.71) are peer dependencies.

### 2. Add path mapping in tsconfig.json

Because the package entry points at `src/index.ts`, map the package name to the source so TypeScript resolves types without a build step:

```json
{
  "compilerOptions": {
    "paths": {
      "@applens/react-native": ["../AppLens/src/index.ts"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "../AppLens/src/**/*.ts",
    "../AppLens/src/**/*.tsx"
  ]
}
```

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
      projectRoot: '/path/to/your/project',
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

`<AppLensUI />` renders both the floating trigger and the modal, and wires up the React context internally. Place it as the last child inside your root provider so it renders on top of all other UI.

---

## `AppLens.initialize(config)`

Call `AppLens.initialize(config)` once at app startup. It merges your partial config with the defaults. Calling it again updates the config but does not re-attach interceptors that are already running.

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. When `false`, no interception or UI occurs. |
| `network` | `boolean` | `true` | Capture network requests (XHR / fetch). |
| `console` | `boolean` | `true` | Capture `console.log/info/warn/error/debug` output. |
| `events` | `boolean` | `true` | Enable the `AppLens.trackEvent()` API. |
| `errors` | `boolean` | `true` | Capture uncaught errors and unhandled promise rejections. |
| `ai` | `boolean` | `true` | Enable the AI tab and AI analysis features. |
| `aiProvider` | `'openai' \| 'lmstudio' \| 'local'` | `'openai'` | Which AI backend to use. |
| `aiApiKey` | `string` | `undefined` | API key for the AI provider (never logged). Not required for `lmstudio`/`local`. |
| `aiModel` | `string` | `undefined` | Model identifier, e.g. `'gpt-4o'` for OpenAI or the model name shown in LM Studio. |
| `aiBaseURL` | `string` | `undefined` | Override the AI provider base URL (e.g. `http://127.0.0.1:1234/v1` for LM Studio). |
| `redactHeaders` | `string[]` | built-in list | Header names whose values are replaced with `[REDACTED]` in network logs. |
| `redaction` | `{ headers?: string[]; fields?: string[] }` | `undefined` | Structured redaction option: additional header names and object field names to redact (case-insensitive). |
| `projectRoot` | `string` | `undefined` | Absolute path to the host project root, used by the Code Indexer for AI context. |
| `maxNetworkEntries` | `number` | `500` | Maximum number of network requests kept in memory. |
| `maxLogEntries` | `number` | `1000` | Maximum number of console log entries kept in memory. |
| `maxEventEntries` | `number` | `500` | Maximum number of tracked events kept in memory. |
| `persistLogs` | `boolean` | `false` | Reserved flag for persisting logs across reloads. Not yet implemented. |
| `verboseLogging` | `boolean` | `false` | Enable AppLens's own verbose diagnostic logging. |

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
  projectRoot: '/Users/you/projects/MyApp',
  redactHeaders: ['Authorization', 'x-api-key'],
  redaction: {
    headers: ['x-session-id'],
    fields: ['password', 'token'],
  },
  maxNetworkEntries: 300,
});
```

---

## Public API

```ts
import { AppLens } from '@applens/react-native';

AppLens.initialize(config);          // configure and start AppLens
AppLens.trackEvent(name, props?);    // record a custom event
AppLens.reset();                     // detach interceptors, clear all data, mark uninitialized
AppLens.getVersion();                // '0.2.0'
AppLens.getConfig();                 // read-only copy of the active config
AppLens.getStorage();                // the shared AppLensStorage instance
```

### `AppLens.trackEvent(name, properties?)`

```ts
AppLens.trackEvent('checkout_started', {
  productId: '123',
  amount: 499,
  currency: 'USD',
});
```

No-op when AppLens is disabled or events are turned off. Each event is stored as:

```ts
{
  name: string;
  timestamp: number;              // Unix ms
  properties?: Record<string, unknown>;
}
```

### `AppLens.reset()`

Detaches all interceptors (network, console, errors), clears every data store (network requests, logs, events, errors), and marks AppLens uninitialized. A subsequent `initialize()` call starts fresh.

### `AppLens.getVersion()`

Returns the library version string (`'0.2.0'`).

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
| **Errors** | Uncaught errors and unhandled promise rejections. Each row shows the timestamp, message, and a fatal/non-fatal badge; tap to expand the full stack trace. Searchable and clearable. |
| **AI** | Conversational AI assistant with full context of the application's runtime state and (optionally) source code. Each reply shows a collapsible "Context used" section, a Confidence badge, and a Copy button. |
| **Settings** | Toggle individual AppLens features on/off at runtime without restarting the app. |

If you need finer placement control, `AppLensProvider`, `AppLensTrigger`, and `AppLensModal` are exported separately.

---

## Error Collection

When `errors: true` (the default), AppLens installs an `ErrorInterceptor` that:

- Captures uncaught JavaScript errors via React Native's `ErrorUtils` global handler, then calls the original handler so your app's normal error flow is preserved.
- Captures unhandled promise rejections as non-fatal errors when the Hermes rejection tracker is available. On runtimes without it, rejection capture is a no-op.

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

They appear in the **Errors** tab, feed the Overview error counts, and are available to the AI assistant as context.

---

## Redaction

AppLens never logs secret header values by default. The `redactHeaders` list controls which header values are replaced with `[REDACTED]` in network logs:

```ts
AppLens.initialize({
  redactHeaders: ['Authorization', 'x-session-id', 'x-device-token'],
});
```

For additional control, the structured `redaction` option lets you add header names and object field names (both matched case-insensitively):

```ts
AppLens.initialize({
  redaction: {
    headers: ['x-internal-token'],
    fields: ['password', 'secret', 'accessToken'],
  },
});
```

Redaction is implemented by the shared `redactHeaders` / `redactFields` utilities and always replaces the matched value with `[REDACTED]` without mutating the original data.

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

- **openai** — uses the OpenAI API; requires `aiApiKey`.
- **lmstudio** — points at a local LM Studio server via `aiBaseURL`; no API key required.
- **local** — a stub provider that works without any backend and returns canned guidance.

### Connecting to a local LLM (LM Studio)

When running against a local LM Studio server, the correct base URL depends on where the app runs. On an Android emulator, `127.0.0.1` refers to the emulator itself — not your computer — so the emulator must reach the host via `10.0.2.2`.

| Platform | Base URL |
| --- | --- |
| iOS simulator | `http://127.0.0.1:1234/v1` |
| Android emulator | `http://10.0.2.2:1234/v1` |
| Physical device | `http://<your-computer-LAN-IP>:1234/v1` |

- Enable **'Serve on Local Network'** in LM Studio so it binds `0.0.0.0` rather than only localhost. Without this, emulator and device connections fail even with the right base URL.
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

> **Security note:** Never hard-code your API key in source control. Use environment variables or a secrets manager and inject the key at build time. API keys are never written to logs.

### AI context and code awareness

AppLens AI is not a generic chatbot. The Context Engine assembles structured context from:

- Captured network requests and responses
- Console log history
- Tracked events
- Captured runtime errors
- The Application Knowledge Graph (component → hook → service → API → state relationships)
- Indexed source code (when `projectRoot` is configured)

Each AI reply includes a line in the form `Confidence: High | Medium | Low`, which the UI parses into a colored badge.

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

```
@applens/react-native
└── src/
    ├── core/
    │   ├── AppLens.ts          # Singleton — initialize(), trackEvent(), reset(), getVersion(), getters
    │   ├── AppLensConfig.ts    # AppLensConfig type and DEFAULT_CONFIG
    │   ├── AppLensProvider.tsx # React context provider + useAppLens() hook
    │   └── AppLensUI.tsx       # Root component (trigger + modal + provider)
    ├── interceptors/
    │   ├── NetworkInterceptor.ts  # Patches global XHR and fetch
    │   ├── ConsoleInterceptor.ts  # Overrides global console methods
    │   └── ErrorInterceptor.ts    # ErrorUtils global handler + Hermes rejection tracker
    ├── storage/
    │   ├── AppLensStorage.ts   # Synchronous storage interface
    │   └── MemoryStorage.ts    # In-memory ring-buffer implementation
    ├── components/
    │   ├── AppLensModal.tsx    # Full-screen modal with the 7-tab bar
    │   ├── AppLensTrigger.tsx  # Floating trigger button
    │   ├── Badge.tsx
    │   ├── JSONViewer.tsx      # Syntax-highlighted, horizontally scrollable JSON
    │   ├── LogEntryRow.tsx
    │   ├── NetworkEntry.tsx
    │   └── SearchBar.tsx
    ├── tabs/
    │   ├── OverviewTab.tsx
    │   ├── NetworkTab.tsx
    │   ├── NetworkDetailScreen.tsx
    │   ├── ConsoleTab.tsx
    │   ├── EventsTab.tsx
    │   ├── ErrorsTab.tsx
    │   ├── AITab.tsx
    │   └── SettingsTab.tsx
    ├── ai/
    │   ├── AIProvider.ts       # Provider interface + createAIProvider() factory
    │   ├── OpenAIProvider.ts
    │   ├── LocalAIProvider.ts
    │   ├── KnowledgeGraph.ts
    │   ├── ContextEngine.ts
    │   ├── CodeIndexer.ts
    │   └── index-project.js    # Build-time code-index CLI helper
    ├── types/
    │   ├── NetworkTypes.ts
    │   ├── LogTypes.ts
    │   ├── EventTypes.ts
    │   ├── ErrorTypes.ts
    │   └── AITypes.ts
    └── index.ts                # Public API barrel
```

Storage is synchronous (methods return values/arrays, not Promises) and backed by an in-memory ring buffer that evicts the oldest entries. You can supply your own storage by implementing the exported `AppLensStorage` interface.

---

## Exports

Values: `AppLens`, `AppLensProvider`, `useAppLens`, `AppLensUI`, `AppLensModal`, `AppLensTrigger`, `createAIProvider`, `OpenAIProvider`, `LocalAIProvider`, `KnowledgeGraph`, `ContextEngine`.

Types: `AppLensConfig`, `NetworkRequest`, `LogEntry`, `LogLevel`, `AppEvent`, `AppError`, `AIMessage`, `AIConversation`, `ContextChunk`, `AppLensStorage`, `AIProvider`, `GraphNode`, `NodeType`.

---

## Known Limitations

- **Promise-rejection capture depends on Hermes.** Unhandled rejection tracking uses the Hermes rejection tracker when available; on other engines it is a no-op (uncaught errors are still captured via `ErrorUtils`).
- **`persistLogs` is reserved.** The flag exists in the config but persistence is not yet implemented — all data is in-memory and cleared on reload.
- **AI requires a backend.** Without `aiApiKey` (OpenAI) or an `aiBaseURL` (LM Studio), the AI tab falls back to the `local` stub provider, which returns canned guidance rather than real answers.
- **Code Indexer is Node-only.** `ai/index-project.js` runs as a build-time CLI script; the in-app AI draws on the pre-built index and live runtime context rather than re-indexing on-device.
- **No automated test suite.** Verification is `npx tsc --noEmit` (strict type-check).

---

## License

MIT
