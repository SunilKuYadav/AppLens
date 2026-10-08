# AppLens v0.2.0 — Delivery Summary

> Package: `@applens/react-native`
> Location: `/Users/sunilkumar/Desktop/project/AppLens/AppLens/`

---

## What was built

AppLens is a developer-focused debugging and observability library for React Native applications. It ships as a local npm package (raw TypeScript, no build step) and provides an in-app developer console accessible via a floating trigger button. The console opens a full-screen modal with **seven tabs**: Overview, Network, Console, Events, Errors, AI, and Settings.

v0.2.0 adds end-to-end error collection, shared redaction utilities, `AppLens.reset()`/`AppLens.getVersion()`, new config fields, JSONViewer syntax highlighting, and AI context/confidence/copy enhancements. It also fixes a `tsconfig.json` `moduleResolution` setting so `npx tsc --noEmit` runs on a clean checkout.

---

## New files in v0.2.0

| File | Purpose |
|---|---|
| `src/types/ErrorTypes.ts` | `AppError` type (`{ id, message, stack?, timestamp, isFatal }`) |
| `src/utils/redact.ts` | Shared `redactHeaders` / `redactFields` utilities (replace matched values with `[REDACTED]`) |
| `src/interceptors/ErrorInterceptor.ts` | Captures uncaught errors via `ErrorUtils` and Hermes promise rejections; preserves the existing global handler |
| `src/tabs/ErrorsTab.tsx` | Errors tab — searchable list, clear, fatal/non-fatal badge, expandable stack trace |
| `CHANGELOG.md` | Keep a Changelog history ([0.2.0] + [0.1.0]) |

---

## Full file map

### Package root

| File | Purpose |
|---|---|
| `package.json` | Package name `@applens/react-native`, version `0.2.0`, peer deps, entry point |
| `tsconfig.json` | Strict TypeScript config, no emit; `moduleResolution: node` |
| `babel.config.js` | Babel preset for React Native |
| `README.md` | Full integration guide, API reference, architecture diagram |
| `CHANGELOG.md` | Release history |
| `.gitignore` | Standard Node / React Native ignore rules |

### `src/core/`

| File | Purpose |
|---|---|
| `AppLens.ts` | Singleton — `initialize()`, `trackEvent()`, `reset()`, `getVersion()`, `getConfig()`, `getStorage()`, interceptor lifecycle |
| `AppLensConfig.ts` | `AppLensConfig` type and all default values |
| `AppLensProvider.tsx` | React context provider and `useAppLens()` hook (surfaces network, logs, events, errors) |
| `AppLensUI.tsx` | Root convenience component — renders provider + trigger + modal together |

### `src/interceptors/`

| File | Purpose |
|---|---|
| `NetworkInterceptor.ts` | Patches global `XMLHttpRequest` and `fetch`; redacts sensitive headers via the shared redaction utility |
| `ConsoleInterceptor.ts` | Overrides `console.log/info/warn/error/debug` and stores each call with timestamp and stack trace |
| `ErrorInterceptor.ts` | Installs the `ErrorUtils` global handler and the Hermes promise-rejection tracker; stores captured errors and re-invokes the original handler |

### `src/components/`

| File | Purpose |
|---|---|
| `AppLensModal.tsx` | Full-screen debug modal with the 7-tab navigation bar |
| `AppLensTrigger.tsx` | Floating action button |
| `Badge.tsx` | Reusable colored label chip (HTTP methods, log levels, fatal flags) |
| `JSONViewer.tsx` | Syntax-highlighted JSON renderer with vertical + horizontal scrolling; props `{ data, maxHeight? }` |
| `LogEntryRow.tsx` | Single console-log list item |
| `NetworkEntry.tsx` | Single network-request list item |
| `SearchBar.tsx` | Reusable text search input |

### `src/tabs/`

| File | Purpose |
|---|---|
| `OverviewTab.tsx` | Runtime stats summary plus error (total + fatal) and AppLens version rows |
| `NetworkTab.tsx` | Filterable, searchable list of captured HTTP requests |
| `NetworkDetailScreen.tsx` | Full request / response / error detail for a single network entry |
| `ConsoleTab.tsx` | Searchable, level-filterable console log list with detail and copy |
| `EventsTab.tsx` | Custom event list with search, filter, clear, and detail |
| `ErrorsTab.tsx` | Captured errors with search, clear, fatal badge, and expandable stack |
| `AITab.tsx` | Conversational AI assistant with context-used section, confidence badge, and copy |
| `SettingsTab.tsx` | Runtime toggles for AppLens features |

### `src/ai/`

| File | Purpose |
|---|---|
| `AIProvider.ts` | Abstract `AIProvider` interface and `createAIProvider()` factory |
| `OpenAIProvider.ts` | OpenAI implementation; system prompt emits a `Confidence:` line |
| `LocalAIProvider.ts` | Local stub — works without a backend, returns canned guidance |
| `KnowledgeGraph.ts` | Application entity relationship graph |
| `ContextEngine.ts` | Assembles context chunks (network, console, events, errors, graph) and a context summary |
| `CodeIndexer.ts` | Indexes project source files for code-aware AI answers |
| `index-project.js` | Build-time CLI helper to pre-build the code index |

### `src/storage/`

| File | Purpose |
|---|---|
| `AppLensStorage.ts` | Synchronous storage interface (network, logs, events, errors) |
| `MemoryStorage.ts` | In-memory ring-buffer implementation with subscribe/notify |

### `src/types/`

| File | Purpose |
|---|---|
| `NetworkTypes.ts` | `NetworkRequest` and redacted-header defaults |
| `LogTypes.ts` | `LogEntry`, `LogLevel` |
| `EventTypes.ts` | `AppEvent` |
| `ErrorTypes.ts` | `AppError` |
| `AITypes.ts` | `AIMessage`, `AIConversation`, `ContextChunk`, `AIProviderType` |

### `src/`

| File | Purpose |
|---|---|
| `index.ts` | Public API barrel — re-exports every consumer-facing symbol (adds `AppError` and `AppLensStorage` in v0.2.0) |

---

## Initialization API reference

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch |
| `network` | `boolean` | `true` | Capture network requests |
| `console` | `boolean` | `true` | Capture console output |
| `events` | `boolean` | `true` | Enable `trackEvent()` API |
| `errors` | `boolean` | `true` | Capture uncaught errors + promise rejections |
| `ai` | `boolean` | `true` | Enable AI tab |
| `aiProvider` | `'openai' \| 'lmstudio' \| 'local'` | `'openai'` | AI backend selector |
| `aiApiKey` | `string` | `undefined` | API key for the AI provider (never logged) |
| `aiModel` | `string` | `undefined` | Model identifier |
| `aiBaseURL` | `string` | `undefined` | Override base URL for the AI provider |
| `redactHeaders` | `string[]` | built-in list | Header names whose values are redacted |
| `redaction` | `{ headers?: string[]; fields?: string[] }` | `undefined` | Additional header/field names to redact (case-insensitive) |
| `projectRoot` | `string` | `undefined` | Absolute path to host project root |
| `maxNetworkEntries` | `number` | `500` | Max network entries kept in memory |
| `maxLogEntries` | `number` | `1000` | Max log entries kept in memory |
| `maxEventEntries` | `number` | `500` | Max event entries kept in memory |
| `persistLogs` | `boolean` | `false` | Reserved — not yet implemented |
| `verboseLogging` | `boolean` | `false` | Enable AppLens's own verbose logging |

### Lifecycle / accessor methods

| Method | Description |
|---|---|
| `AppLens.initialize(config)` | Merge config with defaults, attach interceptors for enabled features |
| `AppLens.trackEvent(name, properties?)` | Record a custom event (no-op when disabled) |
| `AppLens.reset()` | Detach all interceptors, clear every store, mark uninitialized |
| `AppLens.getVersion()` | Return `'0.2.0'` |
| `AppLens.getConfig()` | Return a read-only copy of the active config |
| `AppLens.getStorage()` | Return the shared `AppLensStorage` instance |

---

## Known limitations and follow-up items

1. **Promise-rejection capture depends on Hermes.** `ErrorInterceptor` registers the Hermes rejection tracker when available; on other engines unhandled-rejection capture is a no-op, though uncaught errors are still captured via `ErrorUtils`.
2. **`persistLogs` is reserved.** The config field exists but persistence is not implemented — all captured data is in-memory and cleared on reload.
3. **AI requires a backend.** Without `aiApiKey` (OpenAI) or an `aiBaseURL` (LM Studio), the AI tab falls back to the `local` stub provider. Never commit the API key to source control.
4. **Code Indexer is Node-only.** `ai/index-project.js` runs as a build-time CLI script; the in-app AI draws on the pre-built index and live runtime context rather than re-indexing on-device.
5. **No automated test suite.** Verification is `npx tsc --noEmit` (strict type-check). Highest-value future additions: config defaults, network capture + redaction, console capture, error capture, and KnowledgeGraph traversal.
6. **Export name divergence (low severity).** The library exports `AppLensUI`; the original spec named it `AppLensDebugUI`. Individual components are exported separately, so integrations are unaffected.

---

## Verification

```sh
cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit   # exits 0
```
