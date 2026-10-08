# Implementation Plan — AppLens React Native Library

## Context

**Library root:** `/Users/sunilkumar/Desktop/project/AppLens/AppLens/` (macOS case-insensitive; `applens` resolves to the same directory)  
**Integration target:** `/Users/sunilkumar/Desktop/project/AppLens/triveni-point/`  
**Verification command (library):** `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npm install && npx tsc --noEmit`  
**Verification command (integration):** `cd /Users/sunilkumar/Desktop/project/AppLens/triveni-point && npm install && npx tsc --noEmit`

### Key decisions recorded

- **No bundler** — library ships raw TypeScript. Metro resolves `src/index.ts` directly via the `file:` dep path. No compile step required.
- **Manual tab navigation** — plain React state (`activeTab: string`), no react-navigation. Required by spec.
- **XHR + fetch interception** — patched at the global level, NOT via axios interceptors, so it works in any RN app regardless of HTTP client.
- **KnowledgeGraph runtime limitation** — React Native has no `fs` module; KnowledgeGraph works from a pre-built manifest. CodeIndexer is a standalone Node.js script that builds the manifest at dev time.
- **OpenAI package** — `openai@^4.0.0` is the only permitted external dep. `gpt-4o` is the default model.
- **Dark theme** — AppLens uses its own independent dark palette (`#0d0d0d` background, `#1a1a1a` cards) decoupled from Triveni Point's theme system.
- **Naming clarity** — The module exports two things with related names: `AppLens` (the singleton instance, call `AppLens.initialize()`) and `AppLensDebugUI` (the React component, render `<AppLensDebugUI />`). index.ts exports both under clear names.

---

## FEAT-001 — Package scaffold, types, config, storage, interceptors

This is the foundation. All other items depend on the exports created here.

- [ ] 1. Create `package.json`, `tsconfig.json`, `babel.config.js` at library root.
      - `package.json`: name `@applens/react-native`, version `0.1.0`, main/types both `src/index.ts`, peerDeps react>=18 + react-native>=0.71, deps `openai@^4.0.0`, scripts `{ "type-check": "tsc --noEmit" }`.
      - `tsconfig.json`: extends `@react-native/typescript-config/tsconfig.json`, overrides strict true, jsx react-native, noEmit true, skipLibCheck true, moduleResolution node, baseUrl `.`, include `["**/*.ts","**/*.tsx"]`, exclude `["node_modules"]`.
      - `babel.config.js`: `module.exports = { presets: ['module:@react-native/babel-preset'] }`.
      - Files: `/Users/sunilkumar/Desktop/project/AppLens/AppLens/package.json`, `tsconfig.json`, `babel.config.js`
      - Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npm install` completes without error.

- [ ] 2. Create all four type files.
      - `src/types/NetworkTypes.ts` — exports `NetworkRequest` interface (id, method, url, status?, statusText?, requestHeaders, responseHeaders, requestBody?, responseBody?, duration?, timestamp, error?, state: `'pending'|'complete'|'error'`, context?: `{ screen?, hook?, service?, event? }`). Also exports `REDACTED_HEADERS = ['authorization','cookie','x-api-key','x-auth-token','x-access-token','x-secret']` (all lowercase for case-insensitive comparison).
      - `src/types/LogTypes.ts` — exports `LogLevel = 'log'|'info'|'warn'|'error'|'debug'`, `LogEntry` (id, level, message, args: unknown[], timestamp, stack?).
      - `src/types/EventTypes.ts` — exports `AppEvent` (id, name, timestamp, properties?: Record<string, unknown>).
      - `src/types/AITypes.ts` — exports `AIMessage` (id, role: `'user'|'assistant'|'system'`, content, timestamp), `AIConversation` (messages: AIMessage[]), `AIProviderType = 'openai'|'local'`, `ContextChunk` (type: `'network'|'log'|'event'|'graph'|'code'`, content, relevanceScore).
      - Files: `src/types/NetworkTypes.ts`, `src/types/LogTypes.ts`, `src/types/EventTypes.ts`, `src/types/AITypes.ts`
      - Verify: `npx tsc --noEmit` — no errors on these files.

- [ ] 3. Create `AppLensConfig.ts` and `DEFAULT_CONFIG`.
      - `src/core/AppLensConfig.ts` — exports `AppLensConfig` interface (enabled, network, console, events, ai, aiProvider: AIProviderType, aiApiKey?, aiModel?, redactHeaders: string[], projectRoot?, maxNetworkEntries: number, maxLogEntries: number, maxEventEntries: number). Exports `DEFAULT_CONFIG` with all feature booleans true, aiProvider `'openai'`, aiModel `'gpt-4o'`, redactHeaders = REDACTED_HEADERS, maxNetworkEntries 500, maxLogEntries 1000, maxEventEntries 500.
      - Files: `src/core/AppLensConfig.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 4. Create `AppLensStorage` interface and `MemoryStorage` implementation.
      - `src/storage/AppLensStorage.ts` — interface with: `addNetworkRequest`, `updateNetworkRequest(id, Partial<NetworkRequest>)`, `getNetworkRequests`, `clearNetworkRequests`, `addLog`, `getLogs`, `clearLogs`, `addEvent`, `getEvents`, `clearEvents`, `subscribe(listener: () => void): () => void` (returns unsubscribe fn).
      - `src/storage/MemoryStorage.ts` — `implements AppLensStorage`. Three arrays with per-array max cap. Ring buffer logic: when array.length >= max, shift() the oldest item before push(). Listeners: `private listeners = new Set<() => void>()`. `subscribe` adds to set, returns a function that deletes from set. Every mutation calls `this.notify()` which iterates the set. All operations are synchronous.
      - Files: `src/storage/AppLensStorage.ts`, `src/storage/MemoryStorage.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 5. Create `NetworkInterceptor`.
      - `src/interceptors/NetworkInterceptor.ts` — Exports class `NetworkInterceptor`. Constructor receives `storage: AppLensStorage` and `config: AppLensConfig`. `attach()` method: (a) save `globalThis.XMLHttpRequest` as `_origXHR`, replace with a subclass that overrides `open()` (captures method+url), `send()` (captures body, timestamps start, calls `storage.addNetworkRequest(...)` with state `'pending'`), overrides `onload` setter/getter to wrap the handler and on load: captures status, response headers (via `getAllResponseHeaders()`), response body (this.responseText, truncated at 50KB), calculates duration, calls `storage.updateNetworkRequest(..., { state:'complete', ... })`. Override `onerror` similarly with state `'error'`. (b) save `globalThis.fetch` as `_origFetch`, replace with async wrapper that does the same capture/update pattern using the Response clone. `detach()` restores originals. **Header redaction**: before storing any headers object, iterate entries; if the lowercase key matches any entry in `config.redactHeaders`, replace the value with `'[REDACTED]'`. Accept `config.redactHeaders` as lowercase strings and always compare `headerKey.toLowerCase()`. Export class.
      - Files: `src/interceptors/NetworkInterceptor.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 6. Create `ConsoleInterceptor`.
      - `src/interceptors/ConsoleInterceptor.ts` — saves references to original `console.log/info/warn/error/debug`. `attach()` replaces each with a wrapper that: calls the original first (preserves dev console output), generates a `LogEntry` with `id = Math.random().toString(36).slice(2)`, `level`, `message = String(args[0] ?? '')`, `args`, `timestamp = Date.now()`, `stack` captured via `new Error().stack` (strip the first 2 lines which are the Error constructor and the interceptor frame itself). Calls `storage.addLog(entry)`. `detach()` restores originals. Export class.
      - Files: `src/interceptors/ConsoleInterceptor.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 7. Create the `AppLens` singleton and a stub `AppLensProvider`.
      - `src/core/AppLens.ts` — private constructor. Private fields: `_config`, `_storage: MemoryStorage`, `_networkInterceptor: NetworkInterceptor`, `_consoleInterceptor: ConsoleInterceptor`, `_initialized = false`. Public API: `initialize(config: Partial<AppLensConfig>): void` — merges with DEFAULT_CONFIG, calls `attach()` on interceptors only if not already initialized (guard with `_initialized` flag, set after first call). `getConfig(): AppLensConfig`. `getStorage(): AppLensStorage`. `trackEvent(name, properties?)` — creates AppEvent with `id`, `timestamp: Date.now()`, calls `storage.addEvent()`. `isEnabled(): boolean`. Exports `const AppLens = new _AppLens()` (private-named class). Export named `{ AppLens }`.
      - `src/core/AppLensProvider.tsx` — stub that renders `<>{children}</>`. Will be replaced in FEAT-002. Export `AppLensProvider`.
      - `src/index.ts` — barrel: `export { AppLens } from './core/AppLens'`; `export { AppLensProvider } from './core/AppLensProvider'`; all type exports. Add a TODO comment for the AppLensDebugUI component export (added in FEAT-002).
      - Files: `src/core/AppLens.ts`, `src/core/AppLensProvider.tsx`, `src/index.ts`
      - Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` — exits 0.

---

## FEAT-002 — UI layer: provider context, shared components, modal, tab screens

Depends on FEAT-001. Creates all React components. AI tab created as a placeholder; FEAT-003 replaces it.

- [ ] 8. Create `AppLensContext` and replace stub `AppLensProvider`.
      - `src/core/AppLensProvider.tsx` — `AppLensContextValue` interface: `{ modalVisible: boolean; setModalVisible: (v: boolean) => void; activeTab: string; setActiveTab: (t: string) => void; selectedNetworkRequest: NetworkRequest | null; setSelectedNetworkRequest: (r: NetworkRequest | null) => void; selectedLogEntry: LogEntry | null; setSelectedLogEntry: (e: LogEntry | null) => void; networkRequests: NetworkRequest[]; logs: LogEntry[]; events: AppEvent[]; }`. Create context with `React.createContext`. `AppLensProvider` component: subscribes to `AppLens.getStorage().subscribe(...)` in a `useEffect`, re-fetches all three collections into state on every storage change. Provides context. Also exports `useAppLens()` hook. At bottom of file, export `AppLensDebugUI` component that renders `<AppLensProvider><AppLensTrigger /><AppLensModal /></AppLensProvider>` — this is what consumers put in their app. Update `src/index.ts` to `export { AppLensDebugUI } from './core/AppLensProvider'`.
      - Files: `src/core/AppLensProvider.tsx`, `src/index.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 9. Create shared UI components.
      - `src/components/Badge.tsx` — Props: `label: string, color: string, textColor?: string`. `View` with `borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2`. `Text` inside. Export `Badge`.
      - `src/components/SearchBar.tsx` — `View` row: `TextInput` (flex 1) + `TouchableOpacity` × button (visible when value.length > 0). Dark themed. Props: `value, onChangeText, placeholder`. Export `SearchBar`.
      - `src/components/JSONViewer.tsx` — Props: `data: unknown, maxHeight?: number`. Renders `ScrollView` with `Text` showing `JSON.stringify(data, null, 2)`. Monospace-ish via `fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'`. Export `JSONViewer`.
      - `src/components/NetworkEntry.tsx` — single list row. Method badge color map: GET=#3b82f6, POST=#22c55e, PUT=#f59e0b, DELETE=#ef4444, PATCH=#a855f7, default=#6b7280. Status color: 2xx=#22c55e, 3xx=#3b82f6, 4xx=#f59e0b, 5xx=#ef4444, undefined=#6b7280. Show truncated URL (max 40 chars with ellipsis). TouchableOpacity wraps the row. Export `NetworkEntry`.
      - `src/components/LogEntry.tsx` — level badge color map: log=#6b7280, info=#3b82f6, warn=#f59e0b, error=#ef4444, debug=#06b6d4. Show timestamp as `new Date(entry.timestamp).toLocaleTimeString()`. Show truncated message (max 80 chars). Export `LogEntry` (rename to `LogEntryRow` internally to avoid naming clash with the `LogEntry` type if needed, but export as `LogEntry`).
      - Files: `src/components/Badge.tsx`, `src/components/SearchBar.tsx`, `src/components/JSONViewer.tsx`, `src/components/NetworkEntry.tsx`, `src/components/LogEntry.tsx`
      - Verify: `npx tsc --noEmit`

- [ ] 10. Create `AppLensTrigger` and `AppLensModal`.
      - `src/components/AppLensTrigger.tsx` — `TouchableOpacity` with `position:'absolute', bottom:32, right:16, zIndex:9999, width:52, height:52, borderRadius:26, backgroundColor:'rgba(13,13,13,0.85)', alignItems:'center', justifyContent:'center'`. Text label `'🔍'`. Calls `useAppLens().setModalVisible(true)` on press. Export `AppLensTrigger`.
      - `src/components/AppLensModal.tsx` — RN `Modal` with `animationType='slide'`, `transparent={false}`, `visible={modalVisible}`. Outer `View` fills screen with bg `#0d0d0d`. Header `View` row: `Text` "AppLens 🔍" + `TouchableOpacity` "×" (calls `setModalVisible(false)`). Tab bar: horizontal `ScrollView` with `contentContainerStyle={{ flexDirection:'row' }}`. 6 tab buttons for `['Overview','Network','Console','Events','AI','Settings']`. Active tab: bottom border `borderBottomWidth:2, borderBottomColor:'#00ff88'`. Content area: `View` with `flex:1` renders the active tab component determined by `activeTab` state from context. Import all 6 tab components. Export `AppLensModal`.
      - Files: `src/components/AppLensTrigger.tsx`, `src/components/AppLensModal.tsx`
      - Verify: `npx tsc --noEmit`

- [ ] 11. Create `OverviewTab` and `SettingsTab`.
      - `src/tabs/OverviewTab.tsx` — `ScrollView`. Section "Network" shows total count + counts per status class. Section "Console" shows total + count per level. Section "Events" shows total. Section "Config" shows each AppLens.getConfig() boolean as enabled/disabled text. Use `useAppLens()` for data. Export `OverviewTab`.
      - `src/tabs/SettingsTab.tsx` — `ScrollView`. 7 setting rows, each `View` with `flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#1a1a1a'`. `Text` label + `Switch` with `trackColor={{ false:'#333', true:'#00ff88' }}`. Local state mirrors `AppLens.getConfig()`. On toggle, call a `updateConfig(key, value)` helper that calls `AppLens.initialize({ ...currentConfig, [key]: value })`. Bottom section shows AI provider and model as read-only text. Export `SettingsTab`.
      - Files: `src/tabs/OverviewTab.tsx`, `src/tabs/SettingsTab.tsx`
      - Verify: `npx tsc --noEmit`

- [ ] 12. Create `NetworkTab` and `NetworkDetailScreen`.
      - `src/tabs/NetworkTab.tsx` — Local state: `search: string`, `methodFilter: string` ('ALL'|'GET'|'POST'|...), `view: 'list'|'detail'`. When `view==='detail'`, renders `NetworkDetailScreen` (passing `selectedNetworkRequest` from context). When `view==='list'`: header row with request count + `SearchBar` + "Clear" `TouchableOpacity`. Below header: horizontal `ScrollView` of method filter pills. `FlatList` of filtered+searched requests, rendered via `NetworkEntry`. On `NetworkEntry` press: call `setSelectedNetworkRequest(request)`, set `view='detail'`. Filtering: search matches URL (case-insensitive). Method filter matches request.method. Export `NetworkTab`.
      - `src/tabs/NetworkDetailScreen.tsx` — Props: `request: NetworkRequest, onBack: () => void`. `ScrollView`. Top row: back arrow `'← Back'` `TouchableOpacity` + method badge + url text. Sections rendered as collapsible or just stacked: (1) **Request** — URL, method, timestamp, headers table (key:value rows with redaction display), query params (parsed from URL using URL split on '?'), body via `JSONViewer`. (2) **Response** — status + statusText, duration, response headers table, body via `JSONViewer`. (3) **Error** — shown only if `request.state==='error'`, shows `request.error` message. (4) **Context** — shown only if any context field present: screen, hook, service, event. Each section has a bold title and `#1a1a1a` card background. Export `NetworkDetailScreen`.
      - Files: `src/tabs/NetworkTab.tsx`, `src/tabs/NetworkDetailScreen.tsx`
      - Verify: `npx tsc --noEmit`

- [ ] 13. Create `ConsoleTab` and `EventsTab`.
      - `src/tabs/ConsoleTab.tsx` — Local state: `search`, `levelFilter: LogLevel | 'ALL'`, `expandedId: string | null`. Header: count + `SearchBar` + level filter pills + Clear button. `FlatList` of filtered logs via `LogEntryRow` component. On row press: toggle `expandedId`. Expanded view shows full message, full args via `JSONViewer`, full stack trace in monospace `Text`. Export `ConsoleTab`.
      - `src/tabs/EventsTab.tsx` — Local state: `search`, `expandedId: string | null`. Header: count + `SearchBar` + Clear. `FlatList` of events. Each row: event name + timestamp + property count. On press: toggle expanded row that shows `JSONViewer` for event.properties. Export `EventsTab`.
      - `src/tabs/AITab.tsx` — placeholder: `View` centered with `Text` "AI — implemented in FEAT-003". Export `AITab`.
      - Files: `src/tabs/ConsoleTab.tsx`, `src/tabs/EventsTab.tsx`, `src/tabs/AITab.tsx`
      - Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` — exits 0.

---

## FEAT-003 — AI engine: KnowledgeGraph, ContextEngine, providers, full AITab

Depends on FEAT-001 and FEAT-002. Replaces the placeholder AITab.

- [ ] 14. Create `AIProvider` interface and factory.
      - `src/ai/AIProvider.ts` — `export interface AIProvider { chat(messages: AIMessage[], context: ContextChunk[]): Promise<string>; isConfigured(): boolean; }`. `export function createAIProvider(config: AppLensConfig): AIProvider` — returns `new OpenAIProvider(config.aiApiKey!, config.aiModel ?? 'gpt-4o')` if `config.aiProvider === 'openai' && config.aiApiKey`, else `new LocalAIProvider()`.
      - Files: `src/ai/AIProvider.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 15. Create `OpenAIProvider` and `LocalAIProvider`.
      - `src/ai/OpenAIProvider.ts` — `implements AIProvider`. Constructor: `(private apiKey: string, private model: string = 'gpt-4o')`. `isConfigured()` returns `this.apiKey.length > 0`. `chat(messages, context)`: build system prompt: `"You are AppLens AI, an expert debugger for a React Native application.\n\nAvailable context:\n" + context.map(c => \`### \${c.type}\n\${c.content}\`).join('\n\n')`. Create `new OpenAI({ apiKey: this.apiKey })`. Call `openai.chat.completions.create({ model: this.model, messages: [{ role:'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role as 'user'|'assistant'|'system', content: m.content }))] })`. Return `response.choices[0]?.message?.content ?? 'No response'`. Wrap in try/catch, re-throw as `new Error(\`AI request failed: \${err.message}\`)`.
      - `src/ai/LocalAIProvider.ts` — `implements AIProvider`. `isConfigured()` returns false. `chat()` throws `new Error('No AI provider configured. Pass aiApiKey to AppLens.initialize() to enable AI.')`.
      - Files: `src/ai/OpenAIProvider.ts`, `src/ai/LocalAIProvider.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 16. Create `KnowledgeGraph`.
      - `src/ai/KnowledgeGraph.ts` — `export interface GraphNode { name: string; type: 'screen'|'component'|'hook'|'service'|'store'|'api'; file: string; dependencies: string[]; }`. `export class KnowledgeGraph { private nodes: GraphNode[] = []; addNode(node: GraphNode): void; getNodes(): GraphNode[]; findByName(name: string): GraphNode | undefined; findDependencies(name: string): GraphNode[]; findDependents(name: string): GraphNode[]; static buildFromManifest(nodes: GraphNode[]): KnowledgeGraph { const g = new KnowledgeGraph(); nodes.forEach(n => g.addNode(n)); return g; } toSummary(): string — returns multi-line string listing each node as "TYPE name (file) → deps: dep1, dep2"; toJSON(): GraphNode[]; static fromJSON(data: GraphNode[]): KnowledgeGraph — same as buildFromManifest. }`. Export class.
      - Files: `src/ai/KnowledgeGraph.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 17. Create `CodeIndexer` (Node.js utility, not imported by RN bundle).
      - `src/ai/CodeIndexer.ts` — Add header comment: `// Node.js only — do not import from React Native bundle`. Use `// @ts-ignore` or conditional type guard for Node-only APIs. Exports `async function indexProject(projectRoot: string): Promise<GraphNode[]>`. Implementation: use `require('fs')` and `require('path')` via dynamic require inside the function (so the RN bundler won't fail if it encounters the file — wrap in try/catch). Walk all `.ts`/`.tsx` files recursively. For each file: (a) read source text, (b) extract component names: regex `/(?:function|const)\s+([A-Z][A-Za-z0-9]+)\s*[=\(]/g`, (c) extract hook names: regex `/(?:function|const)\s+(use[A-Za-z0-9]+)\s*[=\(]/g`, (d) extract import paths: regex `/from\s+['"]([^'"]+)['"]/g`, (e) classify node type by file path (screens/ → screen, components/ → component, hooks/ or use*.ts → hook, services/ → service, store/ → store, api → api). Build `GraphNode[]` and return. Note: this runs in Node.js CLI context only. Provide a companion `src/ai/index-project.js` script (plain JS) that calls `indexProject(process.argv[2])` and prints JSON.
      - Files: `src/ai/CodeIndexer.ts`, `src/ai/index-project.js`
      - Verify: file type-checks with `npx tsc --noEmit` (use `// @ts-ignore` or `declare const require` as needed to keep strict mode happy)

- [ ] 18. Create `ContextEngine`.
      - `src/ai/ContextEngine.ts` — `export class ContextEngine { constructor(private storage: AppLensStorage, private graph: KnowledgeGraph) {}`. `getRelevantContext(question: string): ContextChunk[]`: (1) `keywords = question.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOPWORDS.has(w))` where STOPWORDS = new Set(['what','this','that','with','from','have','does','which','when','where','there','their','your','about','into','than','then']). (2) Network chunks: filter `storage.getNetworkRequests()` where URL or responseBody or error includes any keyword. Sort by timestamp desc. Take top 5. Format each as `"\${r.method} \${r.url} → \${r.status ?? 'pending'} (\${r.duration ?? 0}ms)\nResponse: \${String(r.responseBody ?? '').slice(0, 500)}"`. Assign relevanceScore based on how many keywords matched. (3) Log chunks: filter `storage.getLogs()` where message includes any keyword. Sort by timestamp desc. Take top 10. Format each as `"[\${e.level.toUpperCase()}] \${new Date(e.timestamp).toISOString()}: \${e.message}"`. (4) Event chunks: filter `storage.getEvents()` where name or JSON.stringify(properties) includes any keyword. Take top 5. Format each as `"\${ev.name}: \${JSON.stringify(ev.properties)}"`. (5) Graph chunk: if question includes any of ['component','hook','service','flow','architecture','how','navigate','screen','import'], include graph.toSummary() as one chunk with type 'graph', relevanceScore 0.5. Return all chunks sorted by relevanceScore desc.
      - Files: `src/ai/ContextEngine.ts`
      - Verify: `npx tsc --noEmit`

- [ ] 19. Replace placeholder `AITab.tsx` with the full chat UI.
      - `src/tabs/AITab.tsx` — full implementation. State: `messages: AIMessage[]`, `inputText: string`, `isLoading: boolean`, `error: string | null`. On mount: initialize with a system welcome message. `sendMessage()` async handler: (a) append user `AIMessage`, (b) call `ContextEngine.getRelevantContext(inputText)`, (c) call `AIProvider.chat(messages, context)`, (d) append assistant `AIMessage`, (e) catch errors, set `error` state. Instantiate `ContextEngine` and `AIProvider` using `AppLens.getConfig()` and `AppLens.getStorage()`. If `!aiProvider.isConfigured()`: render setup instructions `Text` instead of chat: "To enable AppLens AI, call AppLens.initialize({ aiApiKey: 'sk-...' }) in your app." Chat UI layout: `View flex:1`. `FlatList` (inverted) of messages. Each message: user = right-aligned `View` with `bg:#0d4a2f`, assistant = left-aligned `View` with `bg:#1a1a1a`. Message text + timestamp below. Loading row: `ActivityIndicator` when `isLoading`. Error row: red `Text` when `error`. Bottom input row: `TextInput` (flex 1, bg:#1a1a1a, color:#fff, borderRadius:8, padding:10) + `TouchableOpacity` Send (bg:#00ff88, borderRadius:8). Export `AITab`.
      - Files: `src/tabs/AITab.tsx`
      - Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit` — exits 0.

---

## FEAT-004 — Triveni Point integration + README

Depends on all prior FEATs. Purely additive changes to the host app.

- [ ] 20. Wire the library into Triveni Point's `package.json` and `tsconfig.json`.
      - Add to `triveni-point/package.json` dependencies: `"@applens/react-native": "file:../AppLens"`.
      - Add to `triveni-point/tsconfig.json` paths: `"@applens/react-native": ["../AppLens/src/index.ts"]`. Add `"../AppLens/**/*"` to include array.
      - Files: `triveni-point/package.json`, `triveni-point/tsconfig.json`
      - Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/triveni-point && npm install` (or yarn) completes.

- [ ] 21. Update `App.tsx` to initialize and render AppLens.
      - Import at top: `import { AppLens, AppLensDebugUI } from '@applens/react-native';`
      - Before the `App` component function body (or inside a `useEffect` at the start of App): call `AppLens.initialize({ enabled: __DEV__, network: true, console: true, events: true, ai: true, projectRoot: '/Users/sunilkumar/Desktop/project/AppLens/triveni-point' });` — place this as a module-level side effect just after the import, guarded by `if (__DEV__)`.
      - Inside the `App` component return, as the last child inside `<SafeAreaProvider>` (after `<RootNavigator />`): add `{__DEV__ && <AppLensDebugUI />}`.
      - Only additive changes — existing provider stack and RootNavigator are unchanged.
      - Files: `triveni-point/App.tsx`
      - Verify: `cd /Users/sunilkumar/Desktop/project/AppLens/triveni-point && npx tsc --noEmit` — exits 0 with no errors in App.tsx or in the imported AppLens library files.

- [ ] 22. Write `README.md` for the AppLens library.
      - Sections: Overview, Installation (file: path dep + npm install + App.tsx snippet), `AppLens.initialize()` options table (all config keys, types, defaults), `<AppLensDebugUI />` component usage, `AppLens.trackEvent(name, properties)` API, AI configuration (how to set aiApiKey), tabs overview (what each of the 6 tabs shows), KnowledgeGraph / CodeIndexer usage (run `node src/ai/index-project.js /path/to/app` → feed JSON to `AppLens.initialize({ knowledgeGraph: graphData })`), redaction defaults.
      - Files: `/Users/sunilkumar/Desktop/project/AppLens/AppLens/README.md`
      - Verify: file exists and is non-empty.

---

## Convergence verification (run after all FEATs)

```bash
# Library type check
cd /Users/sunilkumar/Desktop/project/AppLens/AppLens && npx tsc --noEmit

# Integration type check
cd /Users/sunilkumar/Desktop/project/AppLens/triveni-point && npx tsc --noEmit
```

Both must exit 0.
