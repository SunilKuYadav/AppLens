# Implementation Plan — AppLens v0.1.0 → v0.2.0 Upgrade

## Context (verified by reading the codebase)

- **Library root:** `/Users/sunilkumar/Desktop/project/AppLens/AppLens/`
- **Package:** `@applens/react-native` (NOTE: actual name is `@applens/react-native`, NOT `@app-lens/react-native` from the product brief — keep the existing name for backward compat).
- **Version today:** `0.1.0` in `package.json`. Target: `0.2.0`.
- **No build step.** `main` and `types` both point to `src/index.ts`. Library ships raw TypeScript.
- **Verify command:** `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` must exit 0.
- **Branch:** `dev`, clean working tree. Node v20.20.0 available.
- **triveni-point** exists at `/Users/sunilkumar/Desktop/project/AppLens/triveni-point/` but is OUT OF SCOPE for this task — do not modify it.

### Decisions recorded (with rationale)

- **D1 — Fix the pre-existing tsconfig error FIRST.** `npx tsc --noEmit` currently FAILS with `TS5095: Option 'bundler' can only be used when 'module' is set to 'preserve' or 'es2015' or later` because `tsconfig.json` has `module: "commonjs"` + `moduleResolution: "bundler"`. The source itself compiles clean under `--moduleResolution node` (verified). Fix: change `moduleResolution` from `"bundler"` to `"node"` in `tsconfig.json`. Chosen over changing `module` because `commonjs` is the working, established setting and `node` resolution matches how Metro/RN consume the package. Without this fix, step 10 verification can never pass.
- **D2 — Storage stays SYNCHRONOUS.** The existing `AppLensStorage` interface and `MemoryStorage` are fully synchronous (`addLog(e): void`, `getLogs(): LogEntry[]`). The brief's suggested `Promise<void>` signatures would be a breaking change to the whole storage contract and all call sites (interceptors, provider, tabs). Keep the error methods synchronous to match: `addError(error: AppError): void`, `getErrors(query?: { limit?: number }): AppError[]`, `clearErrors(): void`. This preserves backward compat (principle 13) and matches every existing pattern.
- **D3 — Shared redaction utility is generic.** The inline `redactHeaders` in `NetworkInterceptor.ts` operates on `Record<string, string>`. The new `src/utils/redact.ts` uses `Record<string, unknown>` per the brief. `NetworkInterceptor` builds string-valued header maps, which are assignable to `Record<string, unknown>`, and the function returns the same shape — so the interceptor keeps its `Record<string, string>` locals by casting the result. Verified assignable under strict mode.
- **D4 — UI component names unchanged.** The brief references `AppLensDebugUI`, but the actual exported component is `AppLensUI` (plus `AppLensModal`, `AppLensTrigger`, `AppLensProvider`). Renaming would break the public API (principle 13) and the Example/triveni integration. Keep `AppLensUI` as the primary component; do NOT add or rename to `AppLensDebugUI`. Docs will document `AppLensUI`.
- **D5 — Tab list lives in `AppLensModal.tsx`.** There is no central tab container config; `TABS` is a `const` array in `AppLensModal.tsx` and `TabName` is a union in `AppLensProvider.tsx`. Adding the Errors tab means editing both. The tab bar is ALREADY horizontally scrollable (`ScrollView horizontal`), so that sub-requirement is already satisfied — the plan still re-verifies it.
- **D6 — Confidence badge parsing.** The AI providers do not emit a structured confidence field; `AITab` must parse a `Confidence: High|Medium|Low` substring out of the assistant's plain-text reply. The OpenAI system prompt will be updated to ask the model to end replies with such a line so the badge has something to parse; absence of the line simply shows no badge.
- **D7 — Docs are a full rewrite.** Current `README.md` and `DELIVERY.md` describe features that DO NOT exist in code (a Zustand `store/AppLensStore.ts`, `persistLogs` via AsyncStorage, a `sensitiveHeaders` config field). The real config field is `redactHeaders`. The rewrite must describe only what actually ships.

### Constraints enforced throughout
No new external npm dependencies. No breaking changes to existing exports. No build step. Dark theme only (bg `#0d0d0d`, cards `#1a1a1a`, accent `#00ff88`). No react-navigation. TypeScript strict mode — every item ends green on `npx tsc --noEmit`.

---

## Plan

- [ ] 1. Fix the blocking tsconfig error so `tsc` can run at all.
      Change `moduleResolution` from `"bundler"` to `"node"` in `tsconfig.json` (keep `module: "commonjs"`). See decision D1.
      Files: `tsconfig.json`
      Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` exits 0 (it currently fails with TS5095).

- [ ] 2. Create the error type.
      Add `src/types/ErrorTypes.ts` exporting `AppError { id: string; message: string; stack?: string; timestamp: number; isFatal: boolean }`. First confirm no `AppError`/error type already exists in `src/types/` (verified: only NetworkTypes, LogTypes, EventTypes, AITypes exist — no duplication).
      Files: `src/types/ErrorTypes.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 3. Create the shared redaction utility.
      Add `src/utils/redact.ts` with `redactHeaders(headers: Record<string, unknown>, sensitiveKeys: string[]): Record<string, unknown>` (case-insensitive key match against lowercased `sensitiveKeys`, replace matched values with `'[REDACTED]'`, never mutate input) and `redactFields(obj: unknown, sensitiveFields: string[]): unknown` (recursively deep-walk objects and arrays, redacting values whose key matches case-insensitively; return primitives unchanged; guard against cycles). See decision D3.
      Files: `src/utils/redact.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 4. Add error storage to the storage contract and implementation.
      In `src/storage/AppLensStorage.ts` add (synchronous, matching the existing style — see D2): `addError(error: AppError): void`, `getErrors(query?: { limit?: number }): AppError[]`, `clearErrors(): void`. In `src/storage/MemoryStorage.ts` implement all three: a private `errors: AppError[]` ring buffer sized by a new `maxErrorEntries` constructor arg (default 200), `addError` pushes via `pushRingBuffer` then `notify()`, `getErrors` returns a copy sliced to `query.limit` (most-recent-first when a limit is given), `clearErrors` empties and notifies. Confirm the subscribe/notify mechanism already uses `Set<() => void>` (verified it does — no change needed there).
      Files: `src/storage/AppLensStorage.ts`, `src/storage/MemoryStorage.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 5. Create the ErrorInterceptor.
      Add `src/interceptors/ErrorInterceptor.ts` as a class with `constructor(storage: AppLensStorage)`, `attach()`, `detach()` (mirroring `ConsoleInterceptor`'s attach/detach guard pattern). `attach()` saves the current `ErrorUtils.getGlobalHandler()`, installs its own via `ErrorUtils.setGlobalHandler((error, isFatal) => { store AppError; call savedHandler(error, isFatal) })` so RN's normal error handling is preserved (principle: observe, don't replace). Also capture unhandled promise rejections: feature-detect `global.HermesInternal?.enablePromiseRejectionTracker` and register a tracker; fall back to a no-op when unavailable. Build each `AppError` with a generated id (`${Date.now()}-${Math.random().toString(36).slice(2,9)}`), `message`, `stack`, `timestamp: Date.now()`, `isFatal`. `detach()` restores the saved global handler and disables the rejection tracker. Declare minimal ambient types for `ErrorUtils`/`HermesInternal` locally (no new deps) to satisfy strict mode.
      Files: `src/interceptors/ErrorInterceptor.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 6. Switch NetworkInterceptor to the shared redaction utility.
      In `src/interceptors/NetworkInterceptor.ts` delete the local `redactHeaders` function and import `redactHeaders` from `../utils/redact`. At each call site keep header maps typed as `Record<string, string>` by casting the util result (`redactHeaders(raw, list) as Record<string, string>`), per D3. Behaviour must stay identical (case-insensitive, `'[REDACTED]'`).
      Files: `src/interceptors/NetworkInterceptor.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 7. Extend AppLensConfig with the new v0.2.0 fields (all optional / defaulted; keep every existing field).
      In `src/core/AppLensConfig.ts` add to the interface and `DEFAULT_CONFIG`: `persistLogs?: boolean` (default `false`), `verboseLogging?: boolean` (default `false`), `redaction?: { headers?: string[]; fields?: string[] }` (default `undefined`), `errors: boolean` (default `true`). Do not remove or rename any existing field. See D2/D7 — `redactHeaders` stays as-is for backward compat; `redaction` is the new structured option.
      Files: `src/core/AppLensConfig.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 8. Wire version, reset, and error collection into the AppLens singleton.
      In `src/core/AppLens.ts`: add a private `errorInterceptor: ErrorInterceptor | null = null`; add `getVersion(): string` returning `'0.2.0'`; add `reset(): void` that calls `detachInterceptors()` (extend it to also detach the error interceptor), clears all storage (`clearNetworkRequests/clearLogs/clearEvents/clearErrors`), and sets `this.initialized = false`. In `startInterceptors()` and `attachInterceptors()`, initialize/attach `ErrorInterceptor` when `config.errors !== false` and detach it otherwise, following the existing network/console pattern. Pass `maxErrorEntries` through the `MemoryStorage` constructor call (use a default or a new config field if added — simplest: pass the constructor's new default).
      Files: `src/core/AppLens.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 9. Create the ErrorsTab UI.
      Add `src/tabs/ErrorsTab.tsx` following the structure of `EventsTab.tsx` (dark theme `#0d0d0d`/`#1a1a1a`, accent `#00ff88`): header with error count + a Clear button (`AppLens.getStorage().clearErrors()`), a `SearchBar` filtering by `message`, and a `FlatList<AppError>` whose `keyExtractor` returns `item.id`. Each row is a `TouchableOpacity` with `accessibilityRole='button'` showing timestamp, message, and an `isFatal` `Badge` (red when fatal). Tapping expands a detail area showing the full `stack` inside a horizontal `ScrollView`. Add an empty state. Source the error list from the provider (see item 10).
      Files: `src/tabs/ErrorsTab.tsx`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 10. Expose errors through the React context provider.
      In `src/core/AppLensProvider.tsx` add `errors: AppError[]` to `AppLensContextValue`, add `const [errors, setErrors] = useState<AppError[]>([])`, update the `sync` callback to also `setErrors([...storage.getErrors()])`, and include `errors` in the context value and its `useMemo` deps. Add `'Errors'` to the `TabName` union.
      Files: `src/core/AppLensProvider.tsx`
      Verify: `npx tsc --noEmit` exits 0. (Items 9 and 10 together leave the tab consumable.)

- [ ] 11. Register the Errors tab in the modal between Events and AI, and apply accessibility fixes.
      In `src/components/AppLensModal.tsx`: import `ErrorsTab`, insert `'Errors'` into the `TABS` array between `'Events'` and `'AI'` (making 7 tabs), add the `case 'Errors': return <ErrorsTab />` branch in `TabContent`, and add `accessibilityRole='button'` to each tab `TouchableOpacity`. Confirm the tab bar is already a horizontal `ScrollView` (it is — leave as-is). Add `accessibilityRole='button'` to the close-button `TouchableOpacity` too.
      Files: `src/components/AppLensModal.tsx`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 12. Add Errors + version rows to the Overview tab.
      In `src/tabs/OverviewTab.tsx`: read `errors` from `useAppLens()`, compute total and fatal counts, add an "Errors" row/stat showing total count and fatal count, and add an "AppLens" version row showing `AppLens.getVersion()`. Keep the existing dark styling and `Badge` usage.
      Files: `src/tabs/OverviewTab.tsx`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 13. Add syntax highlighting + horizontal scroll to JSONViewer.
      Rewrite `src/components/JSONViewer.tsx` so the pretty-printed JSON is rendered as inline `Text` spans with distinct colors: object keys one color, string values another, numbers/booleans/null a third (dark-theme-appropriate greens/blues on `#111`). Wrap the output in a `ScrollView` that also scrolls horizontally (`horizontal` inner scroll or `nestedScrollEnabled` + a horizontal child) while preserving the existing `maxHeight` prop and vertical scroll. Keep the `JSONViewerProps` API unchanged so all current callers (ConsoleTab, EventsTab, NetworkDetailScreen) keep working.
      Files: `src/components/JSONViewer.tsx`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 14. Enrich the ContextEngine with errors, better keywords, and a summary.
      In `src/ai/ContextEngine.ts`: add a `buildErrorChunks()` that pulls recent `storage.getErrors()` and formats each as `'[ERROR] ${e.message}\n${e.stack ?? ""}'` (high relevance, e.g. 0.9), and include it in `getRelevantContext()`. Improve `extractKeywords`/matching so keywords match partial substrings (the existing `containsAny` already does substring matching on content; extend keyword matching so a short query token also matches longer words — e.g. include tokens of length > 2 and match as substrings both ways). Add `getContextSummary(question: string): string` that returns a human-readable multi-line summary of what context was selected (counts per chunk type and a short preview). Keep the token budget logic.
      Files: `src/ai/ContextEngine.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 15. Upgrade the AITab with context summary, confidence badge, and copy.
      In `src/tabs/AITab.tsx`: for each assistant reply, render a collapsible "Context used" section (above the reply) populated from `contextEngine.getContextSummary(question)` — store the summary alongside the message (e.g. extend the local message state with an optional `contextSummary` field, or keep a parallel map keyed by message id). Parse `Confidence: High|Medium|Low` out of the assistant `content` (case-insensitive regex) and show a colored `Badge` (green/amber/grey); show nothing when absent (see D6). Add a Copy button to each assistant message using React Native's `Clipboard` from `react-native` (no new dep) — if `Clipboard` is unavailable, fall back to a no-op; give the button `accessibilityRole='button'`. Also update the OpenAI system prompt in `src/ai/OpenAIProvider.ts` to ask the model to end with a `Confidence: High|Medium|Low` line.
      Files: `src/tabs/AITab.tsx`, `src/ai/OpenAIProvider.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 16. Update public exports.
      In `src/index.ts` add exports (type-only where appropriate), keeping ALL existing exports: `export type { AppError } from './types/ErrorTypes';` and `export type { AppLensStorage } from './storage/AppLensStorage';`. Confirm the already-present exports cover the required surface: `AppLens`, `AppLensProvider`, the UI component (`AppLensUI` — see D4; the brief says `AppLensDebugUI` but the real export is `AppLensUI`), `AppLensConfig` type, `NetworkRequest`, `LogEntry`, `LogLevel`, `AppEvent`, `AIMessage`. Do not remove anything.
      Files: `src/index.ts`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 17. Bump the package version.
      In `package.json` change `"version": "0.1.0"` to `"0.2.0"`.
      Files: `package.json`
      Verify: `npx tsc --noEmit` exits 0 and `grep '"version": "0.2.0"' package.json` matches.

- [ ] 18. Create CHANGELOG.md.
      Add `CHANGELOG.md` at the library root (Keep a Changelog style) with a `[0.2.0]` section (Added: error collection + ErrorsTab, `AppError` type, shared redaction utils, `AppLens.reset()`, `AppLens.getVersion()`, config fields `errors`/`persistLogs`/`verboseLogging`/`redaction`, JSONViewer syntax highlighting, AI context summary + confidence badge + copy; Changed: NetworkInterceptor uses shared redaction, Overview shows errors + version; Fixed: tsconfig `moduleResolution` so `tsc` runs) and a `[0.1.0]` initial-release section.
      Files: `CHANGELOG.md`
      Verify: file exists and is non-empty (`test -s CHANGELOG.md`).

- [ ] 19. Full rewrite of README.md.
      Rewrite `README.md` to describe ONLY what ships (see D7 — remove the fictional Zustand store, `persistLogs`-via-AsyncStorage claims, and the `sensitiveHeaders` field; the real redaction field is `redactHeaders` plus the new `redaction` option). Include: Quick Start (the `AppLens` singleton + the `AppLensUI` component), all 7 tabs (Overview, Network, Console, Events, Errors, AI, Settings), a full `AppLens.initialize()` options table including the new v0.2.0 fields, the `AppLens.trackEvent()` API, `AppLens.reset()`, `AppLens.getVersion()`, an error-collection section, redaction config (`redactHeaders` + `redaction.headers`/`redaction.fields`), AI config, an architecture diagram, and known limitations. Must contain the string `0.2.0`.
      Files: `README.md`
      Verify: `grep 0.2.0 README.md` matches.

- [ ] 20. Update DELIVERY.md.
      Update `DELIVERY.md` to v0.2.0: add the new files (`src/types/ErrorTypes.ts`, `src/utils/redact.ts`, `src/interceptors/ErrorInterceptor.ts`, `src/tabs/ErrorsTab.tsx`, `CHANGELOG.md`), update the API reference to the real config fields (replace the invented `sensitiveHeaders`/AsyncStorage rows with `redactHeaders` + `redaction`, add `errors`, document `reset()`/`getVersion()`), note the 7-tab UI, and refresh the known-limitations list (e.g. error capture relies on `ErrorUtils`/Hermes rejection tracker availability).
      Files: `DELIVERY.md`
      Verify: `grep 0.2.0 DELIVERY.md` matches.

- [ ] 21. Final verification.
      Run `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` — must exit 0. Then confirm: `package.json` version is `0.2.0`; `CHANGELOG.md` exists and is non-empty; `README.md` contains `0.2.0`; `src/tabs/ErrorsTab.tsx`, `src/interceptors/ErrorInterceptor.ts`, and `src/utils/redact.ts` all exist.
      Files: none (verification only)
      Verify: `npx tsc --noEmit` exits 0 and all listed files/strings are present.

## Known gaps / assumptions
- The brief's `@app-lens/react-native` package name, `AppLensDebugUI` component name, and `Promise`-returning storage signatures all conflict with the shipped code; the plan keeps the existing names/signatures to honor the no-breaking-changes constraint (principles 13 and the task's explicit "No breaking changes to existing public API surface"). If a rename is actually desired, it should be a separate, intentional major-version change.
- Promise-rejection capture depends on Hermes' `enablePromiseRejectionTracker`; on non-Hermes engines it degrades to a no-op, which is acceptable per Phase 6 ("where possible").
