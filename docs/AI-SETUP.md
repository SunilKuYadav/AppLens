# AppLens AI — Setup, Code Map & Modification Guide

> Scope: how the AI subsystem is wired in `@applens/react-native`, where every
> piece lives, how to configure it, and **exactly which file to open** when you
> want to change a given behaviour (including adding tool/function calling).
>
> This document describes the code as it actually exists in `src/ai/` today. A
> few sections (marked **EXTENSION POINT**) describe behaviour that is *not yet
> implemented* and tell you where to add it.

---

## 1. What the AI feature is

AppLens ships an in-app AI assistant (the **AI tab** inside the debug modal).
You ask it questions in plain language ("why did checkout fail?", "what's the
app architecture?") and it answers using **live runtime data** captured by the
library plus an optional **source-code knowledge graph**.

It is a **prompt-based** assistant with retrieval:

1. The user types a question.
2. A **ContextEngine** selects the most relevant captured data (network calls,
   logs, events, errors, code graph) by keyword matching.
3. Those chunks are serialised into a **system prompt**.
4. An **AIProvider** sends the system prompt + conversation to an LLM backend
   and returns the reply.

There is **no OpenAI function/tool calling today** — the model only receives
pre-selected context as text. See [§8 Tool calling](#8-tool-calling-extension-point)
for where you would add it.

---

## 2. File-by-file code map

All AI code lives under `src/ai/` plus a few supporting files. Here is every
file and its single responsibility.

| File | Responsibility |
|------|----------------|
| `src/ai/AIProvider.ts` | The `AIProvider` interface **and** the `createAIProvider(config)` factory that picks a backend. |
| `src/ai/OpenAIProvider.ts` | Real provider. Calls the OpenAI chat-completions API via the `openai` SDK. Also serves LM Studio (OpenAI-compatible). Builds the system prompt. |
| `src/ai/LocalAIProvider.ts` | Stub provider. `isConfigured()` returns `false` and `chat()` throws. Used when nothing is configured. |
| `src/ai/ContextEngine.ts` | Retrieval. Scores and selects context chunks from storage + knowledge graph, enforces a token budget, and produces a human-readable "Context used" summary. |
| `src/ai/KnowledgeGraph.ts` | In-memory graph of the app's components/hooks/services and their dependencies. Built from a manifest; no runtime file access. |
| `src/ai/CodeIndexer.ts` | **Node.js-only** script that parses `.ts/.tsx` files into a `GraphNode[]` manifest for the KnowledgeGraph. Never bundled into the RN app. |
| `src/ai/index-project.js` | CLI wrapper around `CodeIndexer.indexProject()` — run it to produce `knowledge-graph.json`. |
| `src/types/AITypes.ts` | Types: `AIProviderType`, `AIMessage`, `AIConversation`, `ContextChunk`. |
| `src/core/AppLensConfig.ts` | Config shape + defaults, including all `ai*` fields. |
| `src/core/AppLens.ts` | Singleton. Holds config + storage + knowledge graph; exposes `loadKnowledgeGraph()` / `getKnowledgeGraph()`. |
| `src/tabs/AITab.tsx` | The UI. Instantiates the provider + ContextEngine, runs the send loop, renders bubbles, confidence badge, "Context used", and the setup prompt. |
| `src/tabs/SettingsTab.tsx` | Read-only display of the active provider / model / API-key status. |
| `src/index.ts` | Public exports of the AI classes/types. |

### Data flow (one question → one answer)

```
User types in AITab.tsx
        │
        ▼
ContextEngine.getRelevantContext(question)   ← reads AppLensStorage + KnowledgeGraph
        │  returns ContextChunk[]
        ▼
provider.chat(conversationHistory, chunks)   ← OpenAIProvider / LocalAIProvider
        │  OpenAIProvider.buildSystemPrompt(chunks) → persona + context blocks
        ▼
OpenAI SDK → LLM backend (OpenAI API or LM Studio)
        │  returns assistant text (ends with "Confidence: High|Medium|Low")
        ▼
AITab renders the reply + parsed Confidence badge + "Context used" summary
```

---

## 3. Configuration reference

All AI configuration is passed to `AppLens.initialize()` and defined in
`src/core/AppLensConfig.ts`.

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `ai` | `boolean` | `true` | Master switch for the AI tab. |
| `aiProvider` | `'openai' \| 'lmstudio' \| 'local'` | `'openai'` | Which backend to use. |
| `aiApiKey` | `string?` | `undefined` | API key. Required for `openai`; ignored for `lmstudio`. Never logged. |
| `aiModel` | `string?` | `undefined` | Model id. Falls back to `gpt-4o` (OpenAI) / `local-model` (LM Studio). |
| `aiBaseURL` | `string?` | `undefined` | Override the API base URL. LM Studio defaults to `http://127.0.0.1:1234/v1`. |
| `projectRoot` | `string?` | `undefined` | App source root — used by the offline CodeIndexer, not at runtime. |

The `AIProviderType` union lives in `src/types/AITypes.ts`.

### Setup — OpenAI

```ts
AppLens.initialize({
  ai: true,
  aiProvider: 'openai',
  aiApiKey: 'sk-...',
  aiModel: 'gpt-4o', // optional
});
```

### Setup — LM Studio (local, no key)

```ts
AppLens.initialize({
  ai: true,
  aiProvider: 'lmstudio',
  // optional — defaults to http://127.0.0.1:1234/v1
  aiBaseURL: 'http://127.0.0.1:1234/v1',
});
```

Base-URL gotchas (OpenAIProvider surfaces these automatically on a connection
failure to a loopback host — see `buildConnectionHelp()`):

- **Android emulator:** use `http://10.0.2.2:1234/v1` (not `127.0.0.1`, which is
  the emulator itself).
- **iOS simulator:** `127.0.0.1` works.
- **Physical device:** use your computer's LAN IP, e.g. `http://192.168.x.x:1234/v1`.
- Enable "Serve on Local Network" in LM Studio so it binds `0.0.0.0`.
- On Android, allow cleartext HTTP in the debug manifest.

### What happens when nothing is configured

`createAIProvider()` returns a `LocalAIProvider` whose `isConfigured()` is
`false`. `AITab` detects this and renders the **setup prompt** instead of the
chat — see `SetupPrompt` in `src/tabs/AITab.tsx`.

---

## 4. The system prompt (persona + context injection)

Defined in `OpenAIProvider.buildSystemPrompt()` (`src/ai/OpenAIProvider.ts`).

It assembles:

1. A fixed **persona** block ("You are AppLens AI — an expert developer
   assistant …").
2. Instructions to treat context blocks as real live data and to be
   evidence-based.
3. A hard requirement that **every answer ends with**
   `Confidence: High|Medium|Low` (the AI tab parses this into a badge).
4. Each selected `ContextChunk` appended as a labelled block:
   `[NETWORK CONTEXT] …`, `[LOG CONTEXT] …`, etc.

If no chunks were selected, it appends a note saying no runtime context was
captured yet.

**To change the assistant's tone, rules, or output format → edit
`buildSystemPrompt()`.** The `Confidence:` contract is parsed in
`parseConfidence()` in `src/tabs/AITab.tsx`; change both if you change the
format.

---

## 5. The ContextEngine (retrieval)

File: `src/ai/ContextEngine.ts`. This decides *what the model sees*.

How it works:

- `extractKeywords()` lowercases the question, splits on non-word chars, drops
  short words and a `STOP_WORDS` set.
- It builds candidate chunks from each source:
  - **Network** (`buildNetworkChunks`): most recent first; always includes the
    last 3 requests as a baseline, plus any whose URL matches a keyword; top 5.
    Error requests score higher (`0.9` vs `0.7`).
  - **Logs** (`buildLogChunks`): baseline of recent errors/warns + keyword
    matches, deduped; top 10. error `0.85`, warn `0.75`, else `0.6`.
  - **Events** (`buildEventChunks`): keyword match on name + properties; top 5;
    score `0.65`.
  - **Errors** (`buildErrorChunks`): recent captured `AppError`s; top 5; score
    `0.9`.
  - **Knowledge graph** (`buildGraphChunk`): included whenever the graph is
    populated; score `0.95` for architecture-type questions else `0.8`.
- All chunks are sorted by `relevanceScore` descending.
- `applyTokenBudget()` caps total output at `MAX_TOTAL_CHARS` (≈8000 tokens;
  `CHARS_PER_TOKEN = 4`), truncating the last chunk to fit.

Tuning knobs (all constants at the top of the file): `STOP_WORDS`,
`GRAPH_KEYWORDS`, `BROAD_QUESTION_WORDS`, `CHARS_PER_TOKEN`, `MAX_TOTAL_CHARS`,
`MAX_CHUNK_BODY_CHARS`.

`getContextSummary()` produces the "Context used" text shown collapsibly under
each assistant reply.

**To change what data the AI sees, how it's ranked, or the token budget → edit
`ContextEngine.ts`.** This is almost always the right place for "the AI didn't
notice X" problems.

---

## 6. The KnowledgeGraph + CodeIndexer (code awareness)

The graph gives the AI structural awareness of your app (screens, components,
hooks, services, stores, APIs and their dependencies).

Important: **`KnowledgeGraph` never reads files at RN runtime.** It is populated
from a manifest produced offline.

### Build the manifest (offline, Node.js)

```bash
node src/ai/index-project.js ./src > knowledge-graph.json
```

`CodeIndexer.indexProject()` walks `.ts/.tsx` files, classifies each
(`classifyFile`), and extracts component/hook/service/class names and relative
imports via regex (`COMPONENT_RE`, `HOOK_RE`, `SERVICE_CLASS_RE`, `IMPORT_RE`).

### Load it into the app at startup

```ts
import manifest from './knowledge-graph.json';
AppLens.loadKnowledgeGraph(manifest);
```

`AppLens.loadKnowledgeGraph()` calls `KnowledgeGraph.buildFromManifest()`, and
the AI tab reads it via `AppLens.getKnowledgeGraph()`. `toSummary()` renders the
graph into the text the ContextEngine injects.

**To improve code detection (e.g. recognise a new file convention) → edit the
regexes / `classifyFile()` in `CodeIndexer.ts`.**
**To change how the graph is summarised for the prompt → edit `toSummary()` in
`KnowledgeGraph.ts`.**

---

## 7. Adding a new AI provider

The provider contract is the `AIProvider` interface in `src/ai/AIProvider.ts`:

```ts
export interface AIProvider {
  chat(messages: AIMessage[], context: ContextChunk[]): Promise<string>;
  isConfigured(): boolean;
}
```

To add a backend (e.g. Anthropic, Gemini, a company gateway):

1. Create `src/ai/MyProvider.ts` implementing `AIProvider`. Build your own
   system prompt from `context` (or reuse the pattern in `OpenAIProvider`).
2. Add the provider name to the `AIProviderType` union in
   `src/types/AITypes.ts`.
3. Wire it into `createAIProvider()` in `src/ai/AIProvider.ts`.
4. Export it from `src/index.ts` if it should be public.
5. (Optional) surface it in `SettingsTab.tsx`.

No changes to `AITab.tsx` are needed — it only talks to the interface.

---

## 8. Tool calling (EXTENSION POINT)

**Not implemented today.** The current design hands the model a fixed context
blob and expects a text answer; the model cannot call back into the app to pull
more data on demand. If you want OpenAI-style function/tool calling (the model
decides it needs, say, "the last 10 network errors" and requests them), here is
where to add it.

### Where to change

1. **`src/ai/OpenAIProvider.ts` — `chat()`**
   - Define a `tools` array (JSON-schema function definitions): e.g.
     `get_network_requests`, `get_errors`, `get_logs`, `get_event`,
     `query_knowledge_graph`.
   - Pass `tools` (and optionally `tool_choice`) to
     `client.chat.completions.create(...)`.
   - After the response, check `response.choices[0].message.tool_calls`. If
     present, execute each requested function locally, append a `role: 'tool'`
     message with the result, and loop (call the API again) until the model
     returns a normal text answer. This is the standard tool-calling loop.

2. **A new tool-executor module (suggested `src/ai/Tools.ts`)**
   - Implement the functions the schema advertises. They read from
     `AppLens.getStorage()` and `AppLens.getKnowledgeGraph()` — the same sources
     the ContextEngine uses, but **on demand** instead of pre-selected.
   - Keep each function pure and bounded (respect a size cap like the existing
     `MAX_CHUNK_BODY_CHARS`) so a tool result can't blow the context window.

3. **`src/ai/AIProvider.ts` — the interface (optional)**
   - If you want tools to be provider-agnostic, extend `AIProvider` with an
     optional `tools?: ToolDefinition[]` or pass a tool registry into `chat()`.
     Providers that don't support tools (`LocalAIProvider`) simply ignore it.

4. **`src/tabs/AITab.tsx` (optional UX)**
   - Show which tools the model invoked (similar to the existing "Context used"
     section) so developers can see what the AI pulled.

### Design notes

- With real tool calling you can **shrink or remove** the ContextEngine's
  pre-selection: instead of guessing what's relevant, let the model ask. A
  hybrid works well — inject a small baseline (knowledge-graph summary + recent
  errors) and expose tools for everything else.
- LM Studio tool-calling support depends on the loaded model; guard with a
  capability check or a config flag before sending `tools`.
- Keep the `Confidence:` ending contract (or move it into a final tool/`response_format`).

---

## 9. Quick "where do I change X?" index

| I want to… | Open this file / symbol |
|------------|-------------------------|
| Change the assistant's persona, rules, or formatting | `OpenAIProvider.buildSystemPrompt()` |
| Change the required `Confidence:` output format | `buildSystemPrompt()` **and** `parseConfidence()` in `AITab.tsx` |
| Change which runtime data the AI sees | `ContextEngine.ts` (the `build*Chunks` methods) |
| Change ranking / relevance scores | `ContextEngine.ts` (score literals in `build*Chunks`) |
| Change the token budget | `MAX_TOTAL_CHARS` / `CHARS_PER_TOKEN` in `ContextEngine.ts` |
| Add/adjust architecture keywords | `GRAPH_KEYWORDS` / `BROAD_QUESTION_WORDS` in `ContextEngine.ts` |
| Add a new model/provider | `AIProvider.ts` + `AITypes.ts` + new `*Provider.ts` |
| Change the default model | `createAIProvider()` fallbacks in `AIProvider.ts` |
| Fix "can't reach local LLM" messaging | `OpenAIProvider.buildConnectionHelp()` |
| Change how code structure is detected | `CodeIndexer.ts` (regexes + `classifyFile`) |
| Change how the code graph is summarised | `KnowledgeGraph.toSummary()` |
| Load a code graph into the app | `AppLens.loadKnowledgeGraph(manifest)` |
| Change the setup prompt shown when unconfigured | `SetupPrompt` in `AITab.tsx` |
| Add tool/function calling | `OpenAIProvider.chat()` + new `Tools.ts` (see §8) |

---

_Last updated for `@applens/react-native` 0.2.1. Verify file paths against
`src/ai/` if the version has moved on._
