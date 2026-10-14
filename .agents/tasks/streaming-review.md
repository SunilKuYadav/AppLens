# Token-by-token streaming for AI chat responses

The change moves AI replies from a single blocking `chat()` call to incremental streaming so tokens appear as they arrive instead of all at once at the end. A `chatStream(messages, context, onToken)` method is added to the `AIProvider` interface; `OpenAIProvider` implements it with `stream: true` and iterates `chunk.choices[0]?.delta?.content`, and the old `chat()` now delegates to `chatStream()` with a no-op callback so both paths share one prompt-build and one error-handling block. In `AITab.tsx`, send appends an empty assistant bubble with a pre-generated id, accumulates deltas into a ref, and flushes to state on `requestAnimationFrame` so a fast local model doesn't trigger a full-list re-render per token. The old `loading` flag is split into `thinking` (indicator, hidden on first token) and `busy` (input/send disabled for the whole request).

Watch for: autoscroll keys on the `messages` array and re-runs on each flush, but whether `scrollToEnd` keeps the newest tokens pinned during a long reply wasn't runtime-verified (likely). Error routing through `buildConnectionHelp()`, backward-compatible `chat()`, confidence parsing, context summaries, and Markdown/copy/timestamps are preserved and verified.

**Verdict**: APPROVED

## High-level view

The provider abstraction grows one method. `chatStream` carries the real logic and `chat` is now a thin delegate passing a no-op `onToken`, which means prompt construction, the empty-response guard, and the local-host connection-help error path exist in exactly one place and both entry points inherit them. `chat()` stays on the interface and in `src/index.ts`, so existing callers compile unchanged.

The error path is intact: the stream iteration lives inside the same `try/catch` that previously wrapped the blocking call, so a `Network request failed` against a loopback/LAN host still routes through `isConnectionError` + `isLocalHost` + `buildConnectionHelp` and surfaces the platform-specific hint. An empty stream still throws "OpenAI returned an empty response."

The UI batches token updates through a ref plus `requestAnimationFrame` rather than calling `setState` over the whole message array per token, and every state update targets the in-flight assistant message by its pre-generated id — both the streaming flushes and the error replacement edit only that one bubble. The thinking indicator shows before the first token and is hidden the moment the first delta lands; the final flush commits the complete `reply` string, so the confidence badge parses against the full text.

The one rough edge is autoscroll. The scroll-to-bottom effect keys on the `messages` array, which changes identity on every flush, so in practice it does re-run during streaming — but whether `scrollToEnd` keeps the newest content pinned depends on FlatList timing, and this wasn't runtime-verified. `AILabScreen.tsx` was deliberately not touched: it runs scenarios and points users to the shared AI tab rather than calling a provider, so streaming reaches it for free through `AITab`.

<details>
<summary>Issues (1)</summary>

1. **Autoscroll during long streams** (likely) — the autoscroll effect depends on `messages`, which changes identity on each rAF flush, so it should re-run; but pinning the newest tokens during a long reply wasn't runtime-verified. Confirm `scrollToEnd` keeps up during streaming on device, and if not, trigger a scroll from the flush path.

</details>

<details>
<summary>Details</summary>

### chatStream carries the logic, chat() delegates

`chat()` is now `return this.chatStream(messages, context, () => {})`, so prompt assembly, the empty-response guard, and error handling live in one place. The empty-response guard moved from `response.choices[0]?.message?.content == null` to `fullText.length === 0` — a stream yielding no non-empty deltas throws the same "OpenAI returned an empty response." error.

The `if (delta)` guard skips empty-string deltas, so they don't fire `onToken`. That lines up with the UI's `firstToken` logic: `thinking` hides only once a non-empty delta arrives, so an empty leading delta won't flip the indicator early. The returned string equals the concatenation of exactly the deltas passed to `onToken`, since `fullText += delta` and `onToken(delta)` run together under the same guard.

### Error path still routes through buildConnectionHelp()

The stream `for await` loop sits inside the same `try` as the request creation, and the `catch` is unchanged from the pre-streaming version:

```ts
if (this.isConnectionError(err.message) && this.isLocalHost()) {
  throw new Error(this.buildConnectionHelp());
}
throw new Error(`${base} — ${err.message}`);
```

A connection failure can surface either when `create({ stream: true })` is awaited or mid-iteration; both are inside the `try`, so the local-host help message is produced in either case. `isConnectionError`, `isLocalHost`, `parseHostPort`, and `buildConnectionHelp` are untouched, so the Android-emulator / iOS-simulator / physical-device guidance is unchanged.

### UI state edits target only the in-flight bubble, batched via rAF

Tokens land in `streamBufferRef`; `scheduleFlush` coalesces to one `requestAnimationFrame`, and `flushStream` does a single `setMessages(prev => prev.map(m => m.id === id ? {...m, content} : m))`. This is the per-token-setState-over-the-whole-array problem avoided correctly — at most one state update per frame regardless of token rate, and each update is an id-scoped edit of a single element rather than a wholesale rebuild. The final flush cancels any pending frame and commits the complete `reply`, closing the gap where the last tokens arrive between frames. The error path does the same id-scoped replacement (`⚠ ${errorText}`) on the already-appended empty bubble instead of appending a second message, and the unmount cleanup cancels a dangling frame.

### Confidence badge parses the completed text

`parseConfidence` runs on `message.content` in `MessageBubble`. During streaming the content is partial so the regex doesn't match until the trailing `Confidence: High|Medium|Low` line streams in; the final flush commits the full `reply`, so the badge resolves against complete text.

### Autoscroll keys on the messages array

The scroll effect depends on `messages`, and every flush replaces the array (via `map`), so it re-runs on each flush, not only on append — it does fire during streaming. The uncertainty is runtime: whether `flatListRef.current?.scrollToEnd` keeps the latest tokens pinned as content height grows wasn't verified on a device, and the coder's note scopes out live RN runtime verification. Flagged likely rather than confirmed for that reason.

### AILabScreen was intentionally left alone

The task brief lists `AILabScreen.tsx` among the files to check for id-scoped, batched updates, but it doesn't call any provider. It runs `scenario.run()` to generate evidence and directs the user to the shared AppLens AI tab, where `AITab` does the actual chat. Streaming therefore reaches Example-app users through `AITab` without any Example-screen change. The coder's verification note calls this out; reading the file confirms it — no provider import, no `chat`/`chatStream` call.

### Backward compatibility and exports

`src/index.ts` still exports `AIProvider` (type), `createAIProvider`, `OpenAIProvider`, `LocalAIProvider` unchanged. `chat()` remains on the interface. `LocalAIProvider.chatStream` throws the same "No AI provider configured" message as its `chat`, keeping the two methods consistent for the unconfigured provider.

### Verification evidence

The coder's note records `npm run type-check` (`tsc --noEmit`) passing clean, exit 0, at the repo root, and states that live end-to-end token streaming against a running LM Studio/OpenAI endpoint plus the RN app could not be exercised headlessly. That matches the one open item (autoscroll behavior under a live stream). No re-run of the type-check or test suite was performed for this review; the evidence is sufficient and the remaining doubt is a runtime UX detail, not a type/compile concern.

</details>

<details>
<summary>Files changed</summary>

- `src/ai/AIProvider.ts` — added `chatStream(messages, context, onToken)` to the interface; `chat()` retained.
- `src/ai/OpenAIProvider.ts` — `chatStream()` with `stream: true`, per-delta `onToken`, shared prompt/error logic; `chat()` delegates to it.
- `src/ai/LocalAIProvider.ts` — `chatStream()` throwing the same "No AI provider configured" error.
- `src/tabs/AITab.tsx` — pre-generated assistant id, ref + rAF batched flush, `thinking`/`busy` split, id-scoped error replacement, unmount cleanup.
- `.agents/tasks/streaming-plan.md` — plan and verification note (not shipped code).

Full diff: `git show cf28e32`.

</details>
