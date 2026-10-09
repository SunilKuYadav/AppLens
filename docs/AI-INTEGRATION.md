# AppLens AI — Integration & Best-Use Guide

> Companion to [`AI-SETUP.md`](AI-SETUP.md). That doc is the code map ("where do
> I change X"). This one is the integration playbook: how to wire AppLens AI
> into a real React Native app and how to get the most useful answers out of it.

---

## 1. Minimal integration (5 minutes)

### 1.1 Install

AppLens is consumed as a git-tag dependency over HTTPS. Add it to your
`package.json` and install — npm clones the tag and runs the `prepare` hook,
which compiles the package to `dist/` on install.

```json
// package.json
{
  "dependencies": {
    "@applens/react-native": "git+https://github.com/SunilKuYadav/AppLens.git#v0.3.1"
  }
}
```

```bash
npm install
# or
yarn install
```

### 1.2 Initialize once, at app startup

Call `AppLens.initialize()` as early as possible (e.g. top of `App.tsx` or your
entry file) so interceptors attach before any network/console activity.

```ts
import { AppLens } from '@applens/react-native';

AppLens.initialize({
  ai: true,
  aiProvider: 'openai',
  aiApiKey: 'sk-...',       // keep out of source control (see §5)
});
```

`initialize()` is **idempotent** — a second call updates config but does not
re-attach interceptors.

### 1.3 Mount the UI

Render `AppLensUI` once near the root of your tree. It provides the floating
trigger button + the full-screen debug modal (which contains the AI tab).

```tsx
import { AppLensUI } from '@applens/react-native';

export default function App() {
  return (
    <>
      <YourApp />
      <AppLensUI />
    </>
  );
}
```

That's the whole integration. Tap the floating button → **AI** tab → ask a
question.

---

## 2. Recommended production-grade setup

```ts
import { AppLens } from '@applens/react-native';
import Config from 'react-native-config'; // or your env solution

const isDev = __DEV__;

AppLens.initialize({
  enabled: isDev,                 // disable entirely in release builds
  network: true,
  console: true,
  events: true,
  errors: true,

  ai: true,
  aiProvider: Config.APPLENS_AI_PROVIDER ?? 'lmstudio',
  aiApiKey: Config.OPENAI_API_KEY,          // undefined for lmstudio
  aiModel: Config.APPLENS_AI_MODEL,
  aiBaseURL: Config.APPLENS_AI_BASE_URL,

  // Redaction — strip secrets before anything is stored or sent to the LLM
  redaction: {
    headers: ['authorization', 'cookie', 'x-api-key'],
    fields: ['password', 'token', 'secret', 'accessToken', 'refreshToken'],
  },

  maxNetworkEntries: 500,
  maxLogEntries: 1000,
  maxEventEntries: 500,
});
```

Guidelines:

- **Gate on `__DEV__`.** AppLens captures request/response bodies and console
  output. Keep `enabled: false` (or don't ship it) in production unless you have
  a deliberate reason and the right redaction.
- **Always configure `redaction`.** Redacted data never reaches the LLM.
- Prefer **LM Studio** when you don't want app data leaving the machine (see
  §5).

---

## 3. Give the AI more to work with

The quality of answers is bounded by what AppLens has captured. The more
signal, the better.

### 3.1 Track meaningful events

```ts
AppLens.trackEvent('checkout_started', { cartValue: 4999, items: 3 });
AppLens.trackEvent('payment_failed', { reason: 'card_declined', gateway: 'stripe' });
```

Events are first-class context — the ContextEngine matches them by name and
properties and feeds them to the model. Well-named events turn "something broke"
into "payment_failed with card_declined right after checkout_started."

### 3.2 Load the code knowledge graph

Without the graph the AI knows your *runtime* but not your *structure*. Build a
manifest offline and load it at startup so the AI can reason about
components/hooks/services and their dependencies.

After a git-tag install with the build step, the package exposes an
`applens-index` bin, so the simplest way to generate the manifest is `npx`.
Point it at **your own app's** source (`./src`), not at AppLens. It uses the
AST indexer (TypeScript compiler API), which is more accurate than the regex
variant.

```bash
# offline, in CI or locally — primary command
npx applens-index ./src > app-graph.json
```

The compiled CLIs also live under `dist/ai/`, so you can call them by explicit
path if you prefer not to use the bin (e.g. to pick the regex variant):

```bash
# AST variant (same as the bin above)
node node_modules/@applens/react-native/dist/ai/index-project-ast.js ./src > app-graph.json

# regex variant
node node_modules/@applens/react-native/dist/ai/index-project.js ./src > app-graph.json
```

```ts
AppLens.loadKnowledgeGraph(require('./app-graph.json'));
```

Now the AI can answer "which screens use `useCheckout`?" or "what does
`OrderService` depend on?" — see `KnowledgeGraph.toSummary()` for exactly what
the model receives. The in-app **Graph** tab previews the loaded graph (grouped
by type), and the **AI** tab shows a hint when the graph is empty so you know to
generate and load one.

> Tip: regenerate the manifest in CI so it stays in sync with the source.

### 3.3 Let activity accumulate before asking

The ContextEngine selects from what's in the in-memory ring buffers. Reproduce
the bug or exercise the flow, *then* ask — a fresh app with no network/log
activity gives the model little to go on (it will say so).

---

## 4. Getting the best answers (prompting patterns)

The assistant is evidence-based and ends every reply with a confidence level.
Ask in ways that line up with how context is selected (keyword matching over
captured data + the code graph).

**Good question shapes:**

- **Debugging:** "Why did the last checkout request fail?" — pulls recent
  network errors (scored highest) + related logs/errors.
- **Data flow:** "Trace what happens after `payment_failed`." — matches the
  event name and nearby activity.
- **Architecture:** "What's the app architecture?" / "Which components use
  `useAuth`?" — triggers the knowledge-graph chunk.
- **Shape mismatches:** "Does the `/orders` response match what the UI expects?"
  — pulls that request's body.

**Tips:**

- Use **real names** from your app (endpoint paths, component/hook names, event
  names). Keyword matching rewards specificity.
- One focused question beats a vague one. "Why is the Cart slow?" → mention the
  endpoint or screen if you know it.
- Read the **"Context used"** section under each answer. If the AI missed
  something, it's usually because that data wasn't selected — reproduce the
  activity or ask more specifically. (If it's a recurring gap, tune
  `ContextEngine.ts`; see `AI-SETUP.md` §5.)
- Trust the **Confidence badge**. "Confidence: Low" means the context didn't
  strongly support the answer — gather more evidence and re-ask.

---

## 5. Privacy, cost & security

**What leaves the device.** With `aiProvider: 'openai'`, selected context
chunks (network bodies, logs, events, code graph) are sent to OpenAI as part of
the prompt. Decide deliberately whether that's acceptable for your data.

- **Keep data local:** use `aiProvider: 'lmstudio'` (or any OpenAI-compatible
  local server via `aiBaseURL`). Nothing leaves your network.
- **Redact first:** configure `redaction.headers` and `redaction.fields`.
  Redaction happens at capture time, so secrets never reach storage or the LLM.
- **Protect the API key:** never hardcode `aiApiKey` in source. Use env config
  (`react-native-config`, build-time injection). The key is never logged, and
  `SettingsTab` only shows a masked `••••••••` indicator.
- **Cost (OpenAI):** each question sends the system prompt + up to ~8000 tokens
  of context + the conversation. Lower `MAX_TOTAL_CHARS` in `ContextEngine.ts`
  to reduce token spend, or switch to a cheaper `aiModel`.

---

## 6. Choosing a backend

| | OpenAI | LM Studio (local) |
|---|--------|-------------------|
| `aiProvider` | `'openai'` | `'lmstudio'` |
| API key | required | not needed (dummy key used) |
| Data leaves device | yes | no |
| Answer quality | high (gpt-4o) | depends on local model |
| Cost | per-token | free (your hardware) |
| Setup friction | key only | run LM Studio + correct base URL |

**Rule of thumb:** LM Studio for sensitive apps or offline work; OpenAI when you
want the strongest reasoning and the data is safe to send.

### LM Studio base URL per platform

- Android emulator: `http://10.0.2.2:1234/v1`
- iOS simulator: `http://127.0.0.1:1234/v1`
- Physical device: `http://<your-LAN-IP>:1234/v1`

Enable "Serve on Local Network" in LM Studio, and allow cleartext HTTP on
Android debug builds. If a connection fails to a loopback host, `OpenAIProvider`
returns a per-platform hint automatically.

---

## 7. Runtime control

| Goal | Call |
|------|------|
| Turn capture on/off at runtime | toggle in `SettingsTab`, then `AppLens.attachInterceptors()` / `detachInterceptors()` |
| Change provider/model at runtime | `AppLens.initialize({ aiProvider, aiApiKey, ... })` — the AI tab re-creates the provider when AI config changes |
| Clear everything and start fresh | `AppLens.reset()` |
| Read current config | `AppLens.getConfig()` |
| Get the library version | `AppLens.getVersion()` |

The AI tab keys its provider on a fingerprint of the AI config fields, so a
re-`initialize()` with a new key/model/base URL takes effect without a restart.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| AI tab shows a setup screen | No provider configured (`LocalAIProvider`) | Pass `aiApiKey` (OpenAI) or set `aiProvider: 'lmstudio'`. |
| "Cannot reach the AI server…" | Wrong base URL for the platform | Use the per-platform URL in §6; enable LAN serving in LM Studio. |
| Answers say "no runtime context captured" | Asked too early / nothing captured | Reproduce the activity first; confirm `network`/`console`/`events` are on. |
| AI doesn't know your architecture | No knowledge graph loaded | Build the manifest and call `AppLens.loadKnowledgeGraph()` (§3.2). |
| Secrets appear in answers | Redaction not configured | Set `redaction.headers` / `redaction.fields`. |
| OpenAI costs too high | Large context per call | Lower `MAX_TOTAL_CHARS` in `ContextEngine.ts` or use a cheaper model. |
| Low-confidence answers | Thin or off-topic context | Ask with specific names; reproduce the flow; check "Context used". |

---

## 9. Want tool calling?

The current assistant receives pre-selected context and cannot fetch more data
on demand. If you want the model to call back into the app (function/tool
calling), see **`AI-SETUP.md` §8** — it names the exact files and the loop to
add (`OpenAIProvider.chat()` + a new `Tools.ts` reading from
`AppLens.getStorage()` / `getKnowledgeGraph()`).

---

_Last updated for `@applens/react-native` 0.3.1._
