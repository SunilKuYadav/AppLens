# Changelog

All notable changes to `@applens/react-native` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Shared redaction utilities** (`redactHeaders` / `redactFields`) used across
  the library; both replace matched values with `[REDACTED]`.
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
