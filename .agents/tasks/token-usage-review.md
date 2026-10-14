# Per-message token usage footer in the AI chat

Adds a compact muted line under each assistant message — `Context ~N · Input N · Output N · Total N` — reporting an estimated context contribution plus exact input/output/total counts from the API, with a chars/4 fallback when the backend omits usage. The reporting shape is a resolve-with-object change: `AIProvider.chatStream` now resolves `{ text, usage? }` instead of a bare string, applied consistently across the interface and both implementers while `chat()` stays `Promise<string>` for backward-compat. Usage is attached to the in-flight assistant message by id on the final commit, and the footer renders nothing when usage is absent, so user/system/errored messages stay clean. The provider computes `contextTokens` from the same serialized context it injects into the prompt, so prompt-building and the estimate can't drift.

Watch for: the token-usage commit bundles a large set of unrelated changes — the `AppLensTrigger.tsx` local-dev rework, `docs/DEVELOPER.md`, `Example/metro.config.js`, `.vscode/settings.json`, and a committed `applens-react-native-0.3.2.tgz` binary — none of which belong to this feature (confirmed). The feature source itself is clean and matches the plan.

**Verdict**: APPROVED

## High-level view

The usage-reporting shape is the one cross-cutting change: `chatStream` resolves `{ text, usage? }` across the `AIProvider` interface, `OpenAIProvider`, and `LocalAIProvider` (which still throws, signature-only), and the single AITab call site destructures it. `chat()` is unchanged in contract and still returns `.text`, so nothing downstream breaks and the `AIUsage` type is exported from `src/index.ts`.

Usage derivation lives entirely in `OpenAIProvider.chatStream`. It requests `stream_options: { include_usage: true }`, reads the final usage chunk without crashing the delta loop (the usage-only chunk has an empty `choices` array, guarded by existing optional chaining), and builds `AIUsage` from the exact API counts when present or a chars/4 fallback with `estimated: true` when absent. `contextTokens` is always an estimate derived from a shared `serializeContext()` helper that `buildSystemPrompt` now reuses, so the injected context and its token estimate stay in sync.

The UI attaches usage to the correct assistant message by id on the single final `setMessages` commit — the batched ref + requestAnimationFrame streaming path is untouched, and the error path commits content with no usage. `formatTokens` prefixes Context with `~` always and Input/Output/Total with `~` only when `estimated`. The footer renders only for assistant messages with a defined `usage`, so absent usage renders nothing rather than zeros.

<details>
<summary>Issues (2)</summary>

1. **Unrelated changes bundled in the feature commit** — the token-usage commit also contains the `AppLensTrigger.tsx` local-dev rework, `docs/DEVELOPER.md`, `Example/` metro/tsconfig/package changes, `.vscode/settings.json`, and a committed `applens-react-native-0.3.2.tgz` binary. Non-blocking for the feature, but split these out; a build artifact tarball in particular should not be committed.
2. **Fallback input estimate joins turns with `\n` only** — the chars/4 fallback approximates input from `systemPrompt + conversation.map(m => m.content).join('\n')`, which ignores role framing/overhead the real request carries. Acceptable since it only runs when the API omits usage and is explicitly marked estimated, but the number will skew low versus a real tokenizer. (possible)

</details>

<details>
<summary>Details</summary>

### Reporting shape applied consistently

`AIProvider.chatStream` resolves `Promise<{ text: string; usage?: AIUsage }>`, `LocalAIProvider.chatStream` carries the matching signature (body still throws, so signature-only), and `OpenAIProvider.chatStream` returns `{ text: fullText, usage }`. `chat()` stays `Promise<string>` via `(await this.chatStream(...)).text`, so the backward-compat contract holds and existing `chat()` callers are unaffected. `AIUsage` is added to the `src/index.ts` re-export. The one call site in `AITab.handleSend` destructures `{ text: reply, usage }` — the only consumer that needed to change.

### Usage capture survives the include_usage final chunk

```ts
let apiUsage: OpenAI.Completions.CompletionUsage | undefined;
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) { fullText += delta; onToken(delta); }
  if (chunk.usage) { apiUsage = chunk.usage; }
}
```

With `include_usage: true`, non-final chunks carry `usage: null` and the terminal chunk carries usage with an empty `choices` array. The `chunk.choices[0]?.delta?.content` optional chaining (pre-existing from the streaming feature) means the empty-choices chunk yields `undefined` rather than throwing, and `if (chunk.usage)` captures only the final non-null object. The empty-response throw (`fullText.length === 0`) is preserved and still fires before any usage is built, so an empty stream errors rather than reporting zero-token usage.

### Exact-vs-estimate branch

The exact branch maps `prompt_tokens`/`completion_tokens`/`total_tokens` directly with `estimated: false`. The fallback branch runs only when `apiUsage` is undefined, estimating input from the sent prompt text and output from the accumulated reply, with `estimated: true`. The two paths are mutually exclusive and the flag is set correctly in each. `contextTokens` is computed in both branches via `estimateTokens(this.serializeContext(context))` and is always an estimate regardless of the flag — matching the UI, which always prefixes Context with `~`.

One caveat on the fallback input estimate: it joins conversation turns with `\n` and omits per-message role framing, so it will read low against a real tokenizer. This is only reachable when the server omits usage and is explicitly surfaced as estimated, so it's acceptable, but it is not a faithful input count.

### Context estimate can't drift from the prompt

`buildSystemPrompt` was refactored to emit its context blocks through a new private `serializeContext(chunks)` (`[TYPE CONTEXT]\n<content>` joined by blank lines), and `contextTokens` estimates over the output of that same helper. Because both the injected prompt text and the token estimate flow through one function, a future change to the block format updates both at once, so the estimate can't silently diverge from what was actually sent.

### UI attaches usage to the right message without disturbing streaming

Usage is applied in the single final-flush `setMessages` map, keyed by `assistantId`, alongside the committed reply text. The incremental streaming path — `streamBufferRef` accumulation and the `requestAnimationFrame` scheduler — is unchanged and never touches usage, so the batched growth behavior from the streaming feature is preserved. The catch block commits `⚠️ ${errorText}` with content only and no usage, so an errored turn renders no token line. `formatTokens` prefixes Context with `~` unconditionally and Input/Output/Total with `~` only when `usage.estimated`, formatting every number with `toLocaleString('en-US')` for thousands separators. The footer is gated on `!isUser && message.usage`, so missing usage renders nothing — no zeros for user, system, or errored messages. The `tokenLine` style (`#555`, size 10) sits with the existing muted footer styling.

### Verification evidence

The plan's verification note and the commit message both record `npm run type-check` (tsc --noEmit) and `npm run build` passing at exit 0, with `AIUsage` emitted into `dist/index.d.ts` and `dist/types/AITypes.d.ts`. Per the review brief the suite was not re-run; the recorded result is trusted. The code trace above corroborates it — the interface change has exactly three dependent edit sites (both providers and the one AITab call site), all of which are present and consistent, which is what a clean type-check would require. No articulable doubt justifies a spot-check.

### Unrelated changes in the same commit

`git show b003df1 --stat` confirms the feature commit also includes `src/components/AppLensTrigger.tsx` (+144/-, the local-dev pickup rework from the user's earlier messages), `src/components/AppLensModal.tsx`, `docs/DEVELOPER.md`, `Example/LOCAL-DEVELOPMENT.md`, `Example/metro.config.js`, `Example/tsconfig.json`, `Example/package.json`, `.vscode/settings.json`, and a binary `applens-react-native-0.3.2.tgz`. None are part of the token-usage feature. This doesn't affect feature correctness, but a packed build tarball and unrelated config churn in a feature commit are worth splitting out; the tarball especially shouldn't be tracked.

</details>

<details>
<summary>File map</summary>

Feature files (this review's scope):
- `src/types/AITypes.ts` — new `AIUsage` interface; optional `usage?` on `AIMessage`.
- `src/index.ts` — `AIUsage` added to the AITypes re-export.
- `src/ai/tokenEstimate.ts` (new) — shared `estimateTokens = ceil(len/4)`, 0 for empty.
- `src/ai/AIProvider.ts` — `chatStream` resolves `{ text, usage? }`; JSDoc updated.
- `src/ai/OpenAIProvider.ts` — `include_usage` request, final-chunk usage capture, exact/fallback `AIUsage`, shared `serializeContext()`; `chat()` returns `.text`.
- `src/ai/LocalAIProvider.ts` — signature updated to match interface; still throws.
- `src/tabs/AITab.tsx` — destructures `{ text, usage }`, attaches usage by id on final commit, `formatTokens` helper and `tokenLine` footer.

Out of scope but bundled in commit b003df1: `src/components/AppLensTrigger.tsx`, `src/components/AppLensModal.tsx`, `docs/DEVELOPER.md`, `Example/*`, `.vscode/settings.json`, `applens-react-native-0.3.2.tgz`.

Full diff: `git show b003df1`
</details>
