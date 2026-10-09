# Implementation Plan — Knowledge-Graph Usability (Graph tab + `applens-index` bin + AI empty-graph hint)

Goal: make AppLens's host-app knowledge graph discoverable, generatable with one
command, and previewable in-app. Three deliverables (A in-app Graph tab, B
`npx applens-index` command, C AI-tab empty-graph hint) plus public exports and
docs. No version bump, no new tag.

## Verified facts from exploration (ground truth)

- Build: `npm run build` = `tsc -p tsconfig.build.json`, emits to `dist/`.
  `tsconfig.json` has `allowJs: true` and `tsconfig.build.json` includes
  `src/**/*.js`, so the `.js` CLI wrappers compile to `dist/ai/`.
- VERIFIED: after `npm run build`, `dist/ai/index-project-ast.js` keeps its
  `#!/usr/bin/env node` shebang on line 1 (tsc treats it as a leading comment
  and preserves it), and `node dist/ai/index-project-ast.js ./src` runs and
  emits a GraphNode JSON array. So the "shebang stripped" risk did NOT
  materialize on this toolchain — no hand-written passthrough is required. The
  plan still includes a verification step to re-confirm this after the change,
  and a fallback if a future tsc build ever strips it.
- No unit-test framework in the library package (`package.json` has no `test`
  script; jest lives only in `Example/`). Verification = `npm run type-check`
  (strict tsc over all `src`), `npm run build`, plus a runtime smoke-run of the
  compiled CLI and a `bin` resolution check. Grep is NOT verification.
- Tabs today (7): `['Overview','Network','Console','Events','Errors','AI','Settings']`
  in `src/components/AppLensModal.tsx`; `TabName` union in
  `src/core/AppLensProvider.tsx`. Target (8): insert `'Graph'` right after
  `'AI'`.
- `AppLens.getKnowledgeGraph()` returns a `KnowledgeGraph`; empty detection via
  `getNodes().length === 0` (equivalently `toSummary()` returns the
  "empty (no manifest loaded)" string). `GraphNode = { name, type, file, dependencies[] }`,
  `NodeType = 'screen'|'component'|'hook'|'service'|'store'|'api'`.
- Dark theme palette (from SettingsTab/OverviewTab/AITab): bg `#0d0d0d`, cards
  `#1a1a1a`, accent green `#00ff88`, body `#e8e8e8`/`#ccc`, muted `#888`/`#555`,
  borders `#2a2a2a`/`#222`. Section-header style: `#888`, 11px, 700, uppercase,
  letterSpacing 0.8.
- The graph describes the HOST APP, not AppLens itself. All copy must tell the
  developer to index THEIR app's `./src`.
- CHANGELOG.md has NO `[Unreleased]` section (top entry is `[0.3.1]`) — create
  one. README states "seven tabs" / lists the 7-tab set in several places
  (intro line, `<AppLensUI />` tab table, ASCII diagram) — all must become 8.

## Canonical copy strings (use verbatim)

- Primary generate command (NEW canonical form):
  `npx applens-index ./src > app-graph.json`
- Startup load snippet:
  `AppLens.loadKnowledgeGraph(require('./app-graph.json'));`
  (TS import form, where used: `import graph from './app-graph.json'; AppLens.loadKnowledgeGraph(graph as GraphNode[]);`)
- Alternative explicit path (keep in docs as fallback):
  `node node_modules/@applens/react-native/dist/ai/index-project-ast.js ./src > app-graph.json`

- Graph tab EMPTY-state copy:
  - Title: `No knowledge graph loaded`
  - Body: `The knowledge graph is a map of your app's screens, components, hooks, services, stores and APIs and how they depend on each other. AppLens AI uses it to answer questions about your architecture, and this tab previews it.`
  - "How to generate" section label: `Generate it from your app's source`
  - Code block 1 (shell): `npx applens-index ./src > app-graph.json`
  - "Then load it at startup" section label: `Load it at startup`
  - Code block 2 (ts): `import graph from './app-graph.json';\nAppLens.loadKnowledgeGraph(graph);`
  - Footer note: `Point applens-index at your own app's source (e.g. ./src), not at AppLens.`

- AI-tab empty-graph hint banner copy (compact, one line + sub-line):
  - Line 1 (strong): `Add a code graph for architecture questions`
  - Line 2 (muted): `Run npx applens-index ./src > app-graph.json, then AppLens.loadKnowledgeGraph(require('./app-graph.json')) at startup.`

## Ordered items

- [ ] 1. Add `'Graph'` to the `TabName` union.
      What: extend the `TabName` union type to include `'Graph'` so all
      tab-name consumers type-check. Insert it between `'AI'` and `'Settings'`
      to match tab order.
      Files: `src/core/AppLensProvider.tsx`
      Verify: `npm run type-check` — exits 0 (no new tab yet referenced, union
      only widened).

- [ ] 2. Create the GraphTab component.
      What: create `GraphTab` reading the graph via
      `AppLens.getKnowledgeGraph()`. NON-EMPTY: a summary header card (total
      node count + a count-by-type breakdown using the fixed type order
      screen→component→hook→service→store→api) then a `ScrollView` list grouped
      by type; each node renders name (accent/strong), file path (muted,
      monospace), and dependencies (muted, comma-joined, omitted when empty).
      Use the SettingsTab/OverviewTab card + sectionHeader conventions and the
      dark palette. Prefer a structured list over dumping `toSummary()`. EMPTY
      (`getNodes().length === 0`): render an empty-state using AITab
      SetupPrompt's visual language (centered, emoji/icon optional, title,
      body, two labeled code blocks) using the exact EMPTY-state copy strings
      above — the `npx applens-index ./src > app-graph.json` command and the
      `loadKnowledgeGraph` startup snippet, plus the host-app footer note.
      Files: `src/tabs/GraphTab.tsx` (new)
      Verify: `npm run type-check` — exits 0.

- [ ] 3. Wire the Graph tab into the modal.
      What: import `GraphTab` in `AppLensModal.tsx`, add `'Graph'` to the
      `TABS` array immediately after `'AI'` so the order is
      `['Overview','Network','Console','Events','Errors','AI','Graph','Settings']`
      (8 tabs), and add a `case 'Graph': return <GraphTab />;` to the
      `TabContent` switch.
      Files: `src/components/AppLensModal.tsx`
      Verify: `npm run type-check` — exits 0 and the switch is exhaustive over
      the widened `TabName` union.

- [ ] 4. Add the AI-tab empty-graph hint banner.
      What: in `AITab`, after the `provider.isConfigured()` early-return
      (so it is only reached on the configured/chat path), compute
      `graphEmpty = AppLens.getKnowledgeGraph().getNodes().length === 0` and,
      when true, render a compact non-blocking hint banner pinned at the top of
      the chat area (above the `FlatList`) using the AI-tab hint copy strings
      above. Compact, dark-theme (card `#1a1a1a`, border `#2a2a2a`, accent
      `#00ff88` for the lead line, `#888` for the sub-line). Not rendered when
      the graph is non-empty; never on the unconfigured `SetupPrompt` path.
      Dismissible is optional; a static banner is acceptable.
      Files: `src/tabs/AITab.tsx`
      Verify: `npm run type-check` — exits 0.

- [ ] 5. Export new public symbols from the barrel.
      What: export `GraphTab` from `src/index.ts` under the Components/Tabs
      area (keep every existing export intact; `GraphNode`/`NodeType` already
      exported). No other new public symbols are introduced by items 1–4.
      Files: `src/index.ts`
      Verify: `npm run type-check` — exits 0.

- [ ] 6. Add the `bin` entry to package.json.
      What: add `"bin": { "applens-index": "dist/ai/index-project-ast.js" }` to
      `package.json`. `files` already includes `dist`; the `prepare` hook
      already builds on git-tag install, producing the compiled CLI at that
      path. Do NOT remove the existing direct-run paths or either `.js` wrapper.
      Do NOT bump `version`.
      Files: `package.json`
      Verify: `npm run build` then
      `node -e "const p=require('./package.json');const f=p.bin['applens-index'];require('fs').accessSync(f);console.log('bin ok:',f)"`
      — prints `bin ok: dist/ai/index-project-ast.js` (confirms the mapped file
      exists after build).

- [ ] 7. Confirm the compiled bin is runnable (shebang + execution).
      What: after `npm run build`, confirm `dist/ai/index-project-ast.js` still
      starts with `#!/usr/bin/env node` and executes end-to-end against this
      repo's own `./src` (produces a non-empty GraphNode JSON array). FALLBACK
      (only if a build ever strips the shebang): replace the compiled artifact
      strategy by shipping a hand-written passthrough `.js` that is copied
      verbatim into `dist/ai/` (add a copy step to the `build` script) so the
      shebang is guaranteed; re-point `bin` at that file if its name differs.
      On this toolchain the shebang is preserved, so the fallback is not
      expected to be needed.
      Files: none (verification of item 6); fallback touches `package.json`
      `build` script + a copied wrapper only if needed.
      Verify: `head -1 dist/ai/index-project-ast.js` shows the shebang AND
      `node dist/ai/index-project-ast.js ./src | head -c 1` prints `[`
      (valid JSON array start, exit 0).

- [ ] 8. Update the AI docs for the new command, tab, and hint.
      What: in `docs/AI-INTEGRATION.md` §3.2 and `docs/AI-SETUP.md`, promote
      `npx applens-index ./src > app-graph.json` as the PRIMARY generate command
      (keep the explicit `node node_modules/...dist/ai/index-project-ast.js`
      form as a documented alternative), document the new in-app Graph tab and
      what it shows, and document the AI-tab empty-graph hint. Emphasize indexing
      the HOST app's source (`./src` of the consumer), not AppLens. Use the
      startup snippet `AppLens.loadKnowledgeGraph(require('./app-graph.json'))`.
      Files: `docs/AI-INTEGRATION.md`, `docs/AI-SETUP.md`
      Verify: manual read-through — the primary command is `npx applens-index`,
      the alternative explicit path is retained, and Graph tab + hint are
      described. (No build impact.)

- [ ] 9. Update README tab references to 8 tabs and the knowledge-graph section.
      What: update README places that enumerate tabs — the intro "seven tabs"
      sentence, the `<AppLensUI />` tab table (add a **Graph** row describing the
      in-app preview), and the ASCII tab diagram
      (`Overview | Network | Console | Events | Errors | AI | Graph | Settings`) —
      and promote `npx applens-index ./src > app-graph.json` in the "Code
      intelligence (knowledge graph)" section (keeping the explicit path as an
      alternative). Keep host-app emphasis.
      Files: `README.md`
      Verify: manual read-through — README consistently says eight tabs,
      includes a Graph row, and shows the `npx applens-index` command.

- [ ] 10. Add a CHANGELOG `[Unreleased]` entry.
      What: create a `## [Unreleased]` section at the top (above `## [0.3.1]`)
      with an `### Added` block containing three bullets: the in-app Graph
      preview tab, the `applens-index` bin command (`npx applens-index ./src >
      app-graph.json`), and the AI-tab empty-graph hint. Do NOT bump the version
      or create a tag.
      Files: `CHANGELOG.md`
      Verify: manual read-through — `## [Unreleased]` exists at top with the
      three Added bullets.

- [ ] 11. Final full verification.
      What: run the project's real checks after all edits.
      Files: none.
      Verify: `npm run clean && npm run type-check && npm run build` all exit 0;
      then `node dist/ai/index-project-ast.js ./src | head -c 1` prints `[`.
      Clean up the generated `dist/` with `npm run clean` if the commit should
      not include build output (dist is produced by `prepare`, not committed).

## Commit scope

Single logical change: "feat(graph): in-app Graph tab, applens-index bin, and
AI empty-graph hint". Stage only source + packaging + docs files:
`src/core/AppLensProvider.tsx`, `src/tabs/GraphTab.tsx`,
`src/components/AppLensModal.tsx`, `src/tabs/AITab.tsx`, `src/index.ts`,
`package.json`, `docs/AI-INTEGRATION.md`, `docs/AI-SETUP.md`, `README.md`,
`CHANGELOG.md`. Do NOT stage `dist/` (build output), do NOT bump version, do NOT
create a tag. Commit locally; do not push.

## Assumptions / gaps

- The AI hint banner is implemented as a static (non-dismissible) compact banner
  for simplicity; dismissible is acceptable but not required. Chosen because it
  needs no new persisted state and matches the "compact, non-blocking" ask.
- `GraphTab` is exported from the barrel for parity with other tabs/components;
  no other new public symbol is needed since `GraphNode`/`NodeType` are already
  exported.
- dist/ is treated as build output (produced by `prepare`), consistent with the
  existing `files`/`clean`/`prepare` setup, so it is not committed.
