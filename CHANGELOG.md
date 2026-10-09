# Changelog

All notable changes to `@applens/react-native` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **In-app Graph tab.** A new **Graph** tab in the debug modal previews the
  loaded code knowledge graph — screens, components, hooks, services, stores,
  and APIs grouped by type with their dependencies — and shows an empty-state
  with the generate command and load snippet when no graph is loaded.
- **`applens-index` bin command.** `package.json` now maps a bin so consumers
  can run `npx applens-index ./src > app-graph.json` (the AST indexer) after a
  git-tag install, instead of calling the explicit `dist/ai/` path.
- **AI-tab empty-graph hint.** When the AI provider is configured but no code
  graph is loaded, the AI tab shows a compact hint pointing to
  `npx applens-index ./src > app-graph.json` and `loadKnowledgeGraph`.

## [0.3.1]

### Added

- **Real build step.** A `tsconfig.build.json` and an npm `prepare` hook so
  git-URL installs auto-compile the TypeScript sources to `dist/` (compiled
  JavaScript + `.d.ts` declarations) on install. A `files` field now ships
  `dist`, `README.md`, and `CHANGELOG.md`.
- **Release automation.** `scripts/sync-version.js` plus `preversion` /
  `version` / `postversion` npm lifecycle hooks, so a single
  `npm version patch|minor|major` type-checks, bumps `package.json`, syncs the
  hardcoded `getVersion()` string, creates the version commit and `vX.Y.Z` tag,
  and pushes with `--follow-tags`.

### Changed

- `main` / `types` now point at `dist/index.js` / `dist/index.d.ts` (was
  `src/index.ts`). The package no longer ships raw TypeScript.
- Consumption is via a **git tag over HTTPS**
  (`git+https://github.com/SunilKuYadav/AppLens.git#v0.3.1`) rather than a
  `file:` dependency; the `prepare` hook builds `dist/` on the consumer at
  install time.

## [0.3.0]

### Added

- **AST-based CodeIndexer variant** (`src/ai/AstCodeIndexer.ts` + CLI
  `src/ai/index-project-ast.js`) built on the TypeScript compiler API, kept
  alongside the existing regex `CodeIndexer.ts`. It is more accurate: it ignores
  doc comments and names real exports instead of falling back to filename
  basenames / phantom nodes.

### Changed

- `typescript` promoted to a **runtime** dependency (needed by the AST indexer
  and, from 0.3.1, by the install-time `prepare` build).

## [0.2.1]

### Added

- **Body-field redaction.** When `config.redaction` is set, `NetworkInterceptor`
  best-effort parses JSON request/response bodies and redacts any field named in
  `redaction.fields` (defaulting to
  `['password','token','secret','accessToken','refreshToken']` when `fields` is
  omitted). Parse failures and non-JSON bodies are left untouched; redaction
  never throws. Header redaction (`redactHeaders`) is unchanged.
- `redactFields` is now exported from the public API (alongside `redactHeaders`).
- New `docs/ARCHITECTURE.md` — the engineering spec with a real module map,
  data-type reference, an Implementation Status table, a phased roadmap
  (phases 1–11), a "Do not build yet" list, and the spec-vs-code divergence note.
- Example app: an **AI Test Lab** tab with runnable scenarios that generate
  deterministic runtime evidence (failed request, response-shape mismatch,
  runtime error, slow request, event funnel, secret redaction, code correlation)
  plus tap-to-copy suggested questions for the AI tab.

### Changed

- Rewrote `README.md` as the single primary user-facing doc: real API names
  (`AppLens` singleton + `AppLensUI`), a full config table with defaults, the
  complete public API and export lists, per-feature notes (50 KB body
  truncation, Hermes-only rejection capture, `NetworkRequest.context` not
  populated), a corrected AI/provider section, and the Code Indexer usage.
- Reduced `DELIVERY.md` to a short pointer to `README.md` and
  `docs/ARCHITECTURE.md`.
- `SettingsTab` footer now renders `AppLens v${AppLens.getVersion()}` instead of
  a hardcoded version string.

### Fixed

- **Version string fix.** `SettingsTab` previously showed a hardcoded
  `AppLens v0.1.0`; it now reflects the real version via `getVersion()`.
  `package.json`, `getVersion()`, and the Settings footer all agree at `0.2.1`.
- **Docs correction.** The 0.2.0 notes claimed the shared `redactFields` utility
  was "used across the library" — it was dead code until this release. Body-field
  redaction is now actually wired through `NetworkInterceptor` (see Added).
- **Docs correction.** Removed the inaccurate claim that the `local` AI provider
  returns canned guidance. `LocalAIProvider` is an unconfigured stub whose
  `chat()` throws, so the AI tab shows a setup prompt instead.
- Example: fixed the pre-existing Jest failure (`transformIgnorePatterns` now
  allowlists the required RN/navigation packages; added a `jest.setup.js`).

## [0.2.0]

### Added

- **Error collection** end-to-end:
  - New `AppError` type (`{ id, message, stack?, timestamp, isFatal }`).
  - `ErrorInterceptor` that captures uncaught JavaScript errors and, when the
    Hermes rejection tracker is available, unhandled promise rejections. It
    preserves React Native's existing global error handler by calling it after
    capturing.
  - Synchronous storage methods `addError()`, `getErrors()`, and `clearErrors()`.
  - A new **Errors** tab in the debug modal (search, clear, fatal/non-fatal
    badge, expandable stack trace).
  - Errors total/fatal counts and a library version row on the Overview tab.
- **Shared redaction utilities** (`redactHeaders` / `redactFields`); both replace
  matched values with `[REDACTED]`. (At 0.2.0 only `redactHeaders` was wired in;
  `redactFields` became active in 0.2.1 — see above.)
- `AppLens.reset()` — detaches all interceptors, clears every data store, and
  marks AppLens uninitialized.
- `AppLens.getVersion()` — returns the library version string.
- New config fields: `errors`, `persistLogs`, `verboseLogging`, and a structured
  `redaction` option (`{ headers?: string[]; fields?: string[] }`).
- JSONViewer syntax highlighting with distinct dark-theme colors and horizontal
  scrolling.
- AI improvements: a collapsible "Context used" section, a Confidence badge
  parsed from the model reply, and a per-reply Copy button.
- New public exports: `AppError` and `AppLensStorage`.

### Changed

- `NetworkInterceptor` now uses the shared redaction utility instead of a local
  copy; behaviour is unchanged.
- The Overview tab now shows error counts and the library version.
- The debug modal now has 7 tabs (Overview, Network, Console, Events, Errors,
  AI, Settings) — Errors sits between Events and AI.

### Fixed

- Corrected `tsconfig.json` `moduleResolution` (`bundler` → `node`) so that
  `npx tsc --noEmit` runs on a clean checkout.

## [0.1.0]

### Added

- Initial release.
- `AppLens` singleton with `initialize()` and `trackEvent()`.
- Floating trigger button and full-screen debug modal (`AppLensUI`).
- Network interception (XHR + fetch) with sensitive-header redaction.
- Console capture (`log` / `info` / `warn` / `error` / `debug`).
- Custom event tracking.
- Six tabs: Overview, Network, Console, Events, AI, Settings.
- In-memory ring-buffer storage behind the `AppLensStorage` interface.
- AI assistant with pluggable providers (OpenAI, LM Studio, local stub), a
  Knowledge Graph, and a Context Engine.
