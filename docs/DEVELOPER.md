# AppLens — Developer Guide

> `@applens/react-native` — v0.3.2
>
> A practical guide for developers who **integrate** AppLens into an app,
> **test** against it, or **contribute** to the library itself.
>
> This is the hands-on companion to the other docs:
>
> | Doc | Scope |
> |---|---|
> | [`../README.md`](../README.md) | Full public API reference. |
> | [`ARCHITECTURE.md`](ARCHITECTURE.md) | Engineering spec, roadmap, implementation status. |
> | [`AI-INTEGRATION.md`](AI-INTEGRATION.md) | Wiring the AI assistant into a real app + prompting. |
> | [`AI-SETUP.md`](AI-SETUP.md) | AI subsystem code map ("which file do I change"). |
> | **`DEVELOPER.md` (this doc)** | Integration, local development, and testing workflow. |

---

## 1. Audiences

This guide serves two developer roles. Jump to the one that fits you:

- **App developers** integrating AppLens into a React Native app → [§2](#2-integrating-applens-into-your-app), [§5](#5-testing-your-integration).
- **Library contributors** working on AppLens itself → [§3](#3-local-library-development), [§4](#4-project-layout), [§6](#6-testing-the-library), [§7](#7-release-workflow).

---

## 2. Integrating AppLens into your app

### 2.1 Install

AppLens is consumed as a **git-tag dependency over HTTPS**. Point `package.json`
at the tagged release and install:

```json
{
  "dependencies": {
    "@applens/react-native": "git+https://github.com/SunilKuYadav/AppLens.git#v0.3.2"
  }
}
```

```sh
npm install   # or yarn install
```

On install, npm clones the tag and runs the package's `prepare` hook, which
compiles the TypeScript sources to `dist/` automatically. `main` resolves to
`dist/index.js` and `types` to `dist/index.d.ts` — no tsconfig path mapping
needed.

Peer dependencies: `react` (>=18), `react-native` (>=0.71).

### 2.2 Wire it in

Two pieces complete the integration: the data singleton and the UI component.

```tsx
// App.tsx
import { AppLens, AppLensUI } from '@applens/react-native';

// Initialize at module load so interceptors attach before the first request.
AppLens.initialize({
  enabled: __DEV__,
  network: true,
  console: true,
  events: true,
  errors: true,
  ai: true,
});

export default function App() {
  return (
    <SafeAreaProvider>
      <YourApp />
      {__DEV__ && <AppLensUI />}
    </SafeAreaProvider>
  );
}
```

- Call `AppLens.initialize(config)` **once**. A second call updates config but
  does not re-create storage or re-attach running interceptors.
- Render `<AppLensUI />` as the **last child** of your root provider so the
  floating trigger and modal sit above all other UI.
- Gate both on `__DEV__` so nothing ships in release builds unless you decide
  otherwise.

See the [README API table](../README.md#applensinitializeconfig) for every
config option, and [`AI-INTEGRATION.md`](AI-INTEGRATION.md) for the AI setup.

### 2.3 Integration checklist

- [ ] Dependency pinned to a specific `#vX.Y.Z` tag (not a branch).
- [ ] `AppLens.initialize()` called once, as early as possible.
- [ ] `<AppLensUI />` mounted at the root, above app content.
- [ ] Capture gated on `__DEV__` (or an explicit flag) for release safety.
- [ ] `redaction.fields` configured for any sensitive request/response bodies.
- [ ] If using AI: provider, model, and base URL set per
      [`AI-INTEGRATION.md`](AI-INTEGRATION.md).
- [ ] If using the Graph/AI code awareness: knowledge-graph manifest generated
      and loaded (see [§2.4](#24-optional-load-a-code-knowledge-graph)).

### 2.4 Optional: load a code knowledge graph

Generate a manifest from **your app's** source and load it at startup so the
Graph and AI tabs can reason about your code structure:

```sh
npx applens-index ./src > app-graph.json
```

```ts
import graph from './app-graph.json';
import { AppLens, GraphNode } from '@applens/react-native';

AppLens.loadKnowledgeGraph(graph as GraphNode[]);
```

---

## 3. Local library development

If you are working on AppLens itself, clone the repo and install at the root:

```sh
git clone https://github.com/SunilKuYadav/AppLens.git
cd AppLens
npm install
```

Core scripts (from `package.json`):

| Command | What it does |
|---|---|
| `npm run type-check` | `tsc --noEmit` — strict type check. **This is the primary gate.** |
| `npm run build` | `tsc -p tsconfig.build.json` — compile `src/` → `dist/`. |
| `npm run clean` | Remove `dist/`. |
| `npm run sync-version` | Rewrite the hardcoded `getVersion()` string from `package.json`. |
| `npm run example` | Start the Example app Metro bundler. |
| `npm run example:ios` | Run the Example app on iOS. |
| `npm run example:android` | Run the Example app on Android. |

> **Edit loop.** The Example app consumes the published git tag by default. For
> a tighter local loop you *may* temporarily point it at a `file:` dependency,
> but the git tag is the supported install path — don't commit a `file:` ref.

Long-running commands (`npm run example`, `example:ios`, `example:android`)
start Metro / native builds and should be run in your own terminal, not through
an automated step.

---

## 4. Project layout

```
@applens/react-native
├── src/
│   ├── core/           # AppLens singleton, config, provider, root UI
│   ├── interceptors/   # Network, Console, Error interceptors
│   ├── storage/        # AppLensStorage interface + MemoryStorage ring buffer
│   ├── components/     # Modal, Trigger, Badge, JSONViewer, …
│   ├── tabs/           # Overview, Network, Console, Events, Errors, AI, Graph, Settings
│   ├── ai/             # AIProvider, ContextEngine, KnowledgeGraph, Code Indexers
│   ├── types/          # Network/Log/Event/Error/AI type definitions
│   ├── utils/          # redact.ts (redactHeaders / redactFields)
│   └── index.ts        # Public API barrel
├── dist/               # Compiled output (generated — do not edit)
├── docs/               # These documents
├── scripts/            # sync-version.js
└── Example/            # ShopDemo reference app with Jest tests
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full module-by-module map and
[`AI-SETUP.md`](AI-SETUP.md) for the AI subsystem specifically.

---

## 5. Testing your integration

AppLens is a developer tool, so the fastest verification is to drive the app and
watch the console surface the activity.

1. **Confirm it's live.** Launch your app in dev. The floating AppLens trigger
   should appear. In code, `AppLens.isEnabled()` returns `true` after a
   successful `initialize()`.
2. **Network tab.** Trigger an API call. It should appear with method, URL,
   status, and duration. Tap it to confirm headers/body are captured and that
   secrets show `[REDACTED]`.
3. **Console tab.** Any `console.log/warn/error` should land here with its
   level and stack.
4. **Events tab.** Call `AppLens.trackEvent('test_event', { ok: true })` and
   confirm it appears.
5. **Errors tab.** Throw a test error (`throw new Error('applens test')`) and
   confirm the row with its fatal/non-fatal badge and stack trace.
6. **Redaction.** Send a request with an auth header and a `password` body
   field; both must display `[REDACTED]` in the Network detail view.
7. **AI tab (if enabled).** Reproduce some activity, then ask a question. A
   configured provider answers with a "Context used" section and a Confidence
   badge; an unconfigured one shows a setup prompt.

### Automated tests in your own app

Because AppLens patches globals (`XMLHttpRequest`, `fetch`, `console`,
`ErrorUtils`), isolate it in your test suite:

- Keep capture off under test — gate `initialize()` on `__DEV__` (Jest sets
  `__DEV__ = true` by default, so set `enabled: false` explicitly in test env if
  the patched globals interfere), or call `AppLens.reset()` in `afterEach` to
  detach interceptors and clear state.
- `AppLens.reset()` restores the original globals and clears every store,
  giving each test a clean slate.

---

## 6. Testing the library

The library itself has **no automated test suite today**. Verification is the
strict type check:

```sh
npm run type-check   # tsc --noEmit — must pass before any commit or release
```

The **Example app** (`Example/`) is the integration/manual test harness and
carries Jest tests:

```sh
cd Example
npm install
npm test              # Jest (App.test.tsx, AILab.test.tsx)
```

Recommended pre-commit routine when changing library code:

1. `npm run type-check` at the repo root (must be clean).
2. `npm run build` to confirm `dist/` compiles.
3. Run the Example app (`npm run example:ios` / `example:android`) and manually
   exercise the tabs affected by your change — use the [§5 checklist](#5-testing-your-integration).
4. If you touched the AI subsystem, verify against both an OpenAI key and a
   local LM Studio server where possible.

> **Contributing tests.** If you add a unit-test setup to the library, Jest with
> `ts-jest` matches the Example app's toolchain. Interceptor and `redact.ts`
> utilities are the highest-value, lowest-friction units to cover first — they
> are pure-ish and don't need a React renderer.

---

## 7. Release workflow (maintainers)

`package.json` is the single source of truth for the version. Cut a release
with the npm `version` lifecycle:

```sh
npm version patch   # or minor | major
```

This runs, in order:

1. `preversion` → `npm run type-check` (aborts if types fail).
2. the `package.json` version bump.
3. `version` → `npm run sync-version` (rewrites `getVersion()` in
   `src/core/AppLens.ts`), then stages that file.
4. the version commit + the `vX.Y.Z` git tag.
5. `postversion` → `git push --follow-tags`.

Consumers then bump their git-tag ref (e.g. `#v0.3.2` → `#v0.3.3`) and reinstall
so the new tag is cloned and `prepare` rebuilds `dist/`.

---

## 8. Improving the SDK documentation

Good docs are part of the deliverable. When you change behaviour, update the
docs in the same change. Guidelines that keep this doc set trustworthy:

### Keep docs truthful to the code

- **Describe what exists, not what's planned.** Mark unimplemented behaviour
  explicitly (the README uses *Reserved / not yet implemented* for
  `persistLogs`, `verboseLogging`, and `NetworkRequest.context`). Readers must
  never discover a documented feature is a stub.
- **Verify every snippet.** Imports, config keys, and CLI commands in docs
  should be copy-paste runnable. A quick `npm run type-check` catches drift in
  TypeScript examples.
- **One source of truth per fact.** The version lives in `package.json`; the API
  table lives in the README. Link to the canonical place instead of restating —
  restated facts rot independently.

### Keep the version string current

The README, these docs, and `getVersion()` all cite a version. `sync-version`
handles the code; the Markdown is manual. When you release, grep for the old
version and update the doc headers and footers:

```sh
grep -rn "0\.3\.2" docs README.md   # find version mentions to bump
```

### Structure for scanning

- Lead with a 5-minute minimal path, then layer depth (see
  [`AI-INTEGRATION.md`](AI-INTEGRATION.md) §1–2 for the pattern).
- Use tables for options, platforms, and command references — they scan faster
  than prose.
- Keep a troubleshooting table of symptom → cause → fix for anything users hit
  repeatedly.
- Cross-link rather than duplicate. Each doc states its scope at the top and
  points elsewhere for adjacent topics.

### Gaps worth filling next

- Per-tab screenshots or a short GIF of the debug modal (nothing visual exists
  in the docs today).
- A `CONTRIBUTING.md` promoting §3–7 of this guide into a standalone
  contributor entry point.
- A documented example of the `redaction` config applied to a real request, so
  integrators can confirm the expected `[REDACTED]` output.
- A migration/changelog note per release summarizing API-visible changes
  (`CHANGELOG.md` exists — keep it current alongside the version bump).

---

## 9. Quick reference

| Task | Command / call |
|---|---|
| Type-check the library | `npm run type-check` |
| Build `dist/` | `npm run build` |
| Run the Example app (iOS) | `npm run example:ios` |
| Run the Example app (Android) | `npm run example:android` |
| Run Example Jest tests | `cd Example && npm test` |
| Generate a code graph | `npx applens-index ./src > app-graph.json` |
| Clear/reset at runtime | `AppLens.reset()` |
| Read active config | `AppLens.getConfig()` |
| Read library version | `AppLens.getVersion()` |
| Cut a release | `npm version patch\|minor\|major` |

---

_Last updated for `@applens/react-native` 0.3.2._
