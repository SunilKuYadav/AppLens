# AI chat response streaming — plan & verification

## Verification note (read this first)
- Ran `npm run type-check` (`tsc --noEmit`) at repo root `/Users/sunilkumar/Desktop/project/AppLens/AppLens` — **passed clean, exit code 0**.
- No public export in `src/index.ts` was removed or retyped. `AIProvider.chat()` remains on the interface (now implemented in terms of `chatStream`); `createAIProvider`, `OpenAIProvider`, `LocalAIProvider` exports unchanged.
- NOT runtime-verified: live end-to-end token streaming against a running LM Studio/OpenAI endpoint plus the RN app cannot run headlessly in this environment. Verified by type-check + code trace only.

## What changed
1. **`src/ai/AIProvider.ts`** — added `chatStream(messages, context, onToken): Promise<string>` to the `AIProvider` interface. `chat()` kept for backward compatibility.
2. **`src/ai/OpenAIProvider.ts`** — added `chatStream()` that calls `chat.completions.create({ ..., stream: true })`, iterates the async stream, extracts `chunk.choices[0]?.delta?.content`, calls `onToken` per non-empty delta, and returns the accumulated string. Reuses `buildSystemPrompt()` and the full connection-error help (`isConnectionError`/`isLocalHost`/`buildConnectionHelp`) in the same try/catch. `chat()` now delegates to `chatStream()` with a no-op callback.
3. **`src/ai/LocalAIProvider.ts`** — added `chatStream()` throwing the same "No AI provider configured" error.
4. **`src/tabs/AITab.tsx`** — on send, appends the user message then an empty assistant message (id generated up front), calls `provider.chatStream`, and streams tokens into a ref (`streamBufferRef`) flushed to state via `requestAnimationFrame` (`scheduleFlush`/`flushStream`) to avoid per-token full-list re-renders. Final flush commits the complete reply. Split the old `loading` into `thinking` (indicator, hidden on first token) and `busy` (disables input/send for the whole request). Error path replaces the empty assistant bubble with `⚠️ <message>`. Pending rAF cancelled on unmount. Autoscroll, confidence badge, copy, timestamps, context summaries, Markdown rendering all preserved.

## Example app
`Example/src/screens/AILabScreen.tsx` does **not** call the provider directly — it runs scenarios and directs the user to the shared AppLens AI tab. Streaming therefore flows through `AITab.tsx`, which both consumers share. No provider-call change was needed in the Example screen.
