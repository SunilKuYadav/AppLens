# Implementation Plan — Per-message token usage display

Builds on the streaming feature (commit cf28e32). Adds a compact, muted token-usage
footer line under each assistant message showing an estimated Context token count plus
exact Input / Output / Total counts from the API (with a chars/4 fallback when the server
omits usage).

## Design decisions (made here, grounded in current source)

1. **chatStream reporting shape: resolve-with-object.**
   Change `chatStream` to resolve with `{ text, usage }` instead of a bare `string`,
   where `usage` is `AIUsage | undefined`. Rationale: usage is a single terminal value
   that arrives in the final stream chunk, not a stream of events, so a resolved object
   models it more naturally than an `onUsage` callback; `AITab.handleSend` already consumes
   the resolved return value (`const reply = await provider.chatStream(...)`), so this is a
   small, type-checked change at the one call site rather than threading a new optional
   parameter through every implementer. `onToken` stays exactly as-is for incremental text.

2. **`chat()` stays `Promise<string>`.** Backward-compat is preserved: `OpenAIProvider.chat`
   calls `chatStream` and returns only `.text`; it ignores `usage`. `LocalAIProvider.chat`
   is unchanged (still throws). No other caller of `chat()` needs changes.

3. **Token estimation heuristic: chars/4**, implemented once as a shared helper
   `estimateTokens(text: string): number` = `Math.ceil(text.length / 4)`. Used for Context
   (always) and for Input/Output fallback (only when the API omits usage).

4. **Context token source.** Computed inside the provider from the `ContextChunk[]` it
   received, using the SAME serialization that feeds the model: the chunks joined the way
   `buildSystemPrompt` emits them (`[TYPE CONTEXT]\n<content>` blocks joined by `\n\n`).
   Expose that joining via a small private helper so prompt-building and context-token
   estimation can't drift. The UI does NOT recompute context tokens.

5. **`estimated` flag semantics.** `usage.estimated` is `true` only when Input/Output/Total
   came from the chars/4 fallback (API returned no usage). `contextTokens` is always an
   estimate regardless of `estimated`, and the UI always prefixes Context with `~`.

6. **Missing usage renders nothing.** If `usage` is `undefined` on a message, the footer
   token line is not rendered (no zeros). This happens for user messages, the system
   welcome, and any assistant message whose turn errored before usage was captured.

## Plan

- [ ] 1. Add the `AIUsage` type and an optional `usage` field on `AIMessage` in AITypes.ts.
      Define `export interface AIUsage { contextTokens: number; inputTokens: number;
      outputTokens: number; totalTokens: number; estimated: boolean }` and add
      `usage?: AIUsage` to `AIMessage`. Keep `ContextChunk` and `AIConversation` unchanged.
      Files: src/types/AITypes.ts
      Verify: `npm run type-check` passes (no new errors).

- [ ] 2. Export the new `AIUsage` type from the package entry point.
      Add `AIUsage` to the existing `export type { AIMessage, AIConversation, ContextChunk }`
      line from `./types/AITypes`.
      Files: src/index.ts
      Verify: `npm run type-check` passes.

- [ ] 3. Add a shared token-estimation helper.
      Create `estimateTokens(text: string): number` returning `Math.ceil(text.length / 4)`
      (return 0 for empty string). Place it in a new tiny module so both the provider and
      any future caller share it. Export it from the module (not necessarily from index.ts).
      Files: src/ai/tokenEstimate.ts (new)
      Verify: `npm run type-check` passes.

- [ ] 4. Change the `AIProvider.chatStream` interface signature to resolve with `{ text, usage }`.
      Update the interface so `chatStream(...)` returns `Promise<{ text: string; usage?: AIUsage }>`
      (import `AIUsage` from ../types/AITypes). Update the JSDoc to note the resolved object
      carries the full text plus optional token usage. Leave `chat(): Promise<string>` and
      `onToken` unchanged. This item intentionally breaks the two implementers and the one
      call site; items 5–7 fix them so the tree compiles again.
      Files: src/ai/AIProvider.ts
      Verify: `npm run type-check` now reports errors ONLY in OpenAIProvider.ts, LocalAIProvider.ts,
      and AITab.tsx (confirms the interface change is the sole source and is contained).

- [ ] 5. Update OpenAIProvider to request usage, capture it, and resolve `{ text, usage }`.
      In `chatStream`: (a) pass `stream_options: { include_usage: true }` in the
      `client.chat.completions.create({...})` call alongside `stream: true`; (b) in the
      delta loop, guard `chunk.choices[0]` being undefined (the usage-only final chunk has an
      empty `choices` array) so token extraction never crashes — keep the existing
      `chunk.choices[0]?.delta?.content` optional chaining and add `const usage = chunk.usage`
      capture when present (store the latest non-null `chunk.usage` into an outer
      `let apiUsage: OpenAI...CompletionUsage | undefined`); (c) after the loop, build the
      `AIUsage`: compute `contextTokens = estimateTokens(serializeContext(context))` always;
      if `apiUsage` exists use its `prompt_tokens`/`completion_tokens`/`total_tokens` with
      `estimated: false`; otherwise fall back to `inputTokens = estimateTokens(systemPrompt +
      joined user/assistant message contents sent)`, `outputTokens = estimateTokens(fullText)`,
      `totalTokens = inputTokens + outputTokens`, `estimated: true`; (d) `return { text: fullText, usage }`.
      Add a private `serializeContext(chunks)` helper that produces the SAME string
      `buildSystemPrompt` injects for the chunk blocks (`[TYPE CONTEXT]\n<content>` joined by
      `\n\n`) and refactor `buildSystemPrompt` to reuse it so they can't drift. Update `chat()`
      to `return (await this.chatStream(messages, context, () => {})).text`. Preserve ALL
      existing connection-error help logic (`isConnectionError`/`isLocalHost`/`buildConnectionHelp`)
      and the empty-response throw.
      Files: src/ai/OpenAIProvider.ts
      Verify: `npm run type-check` passes for this file (errors remain only in AITab.tsx until item 7).

- [ ] 6. Update LocalAIProvider.chatStream return type to match the interface.
      Change the method's return type to `Promise<{ text: string; usage?: AIUsage }>` (import
      the type). The body still throws "No AI provider configured…", so no runtime change is
      needed — only the signature must satisfy the interface. `chat()` stays unchanged (throws).
      Files: src/ai/LocalAIProvider.ts
      Verify: `npm run type-check` passes for this file.

- [ ] 7. Update AITab.handleSend to read the resolved object and attach usage to the message.
      Change `const reply = await provider.chatStream(...)` to `const { text: reply, usage } =
      await provider.chatStream(...)`. In the final-flush `setMessages` map, set both content
      and usage on the in-flight assistant message by id:
      `m.id === assistantId ? { ...m, content: reply, usage } : m`. Leave the error path
      (⚠️ message) unchanged so it carries no usage. The batched streaming path (ref +
      requestAnimationFrame) is unaffected — usage is applied only on the single final commit.
      Files: src/tabs/AITab.tsx
      Verify: `npm run type-check` passes for the whole project (all item-4 errors resolved).

- [ ] 8. Render the token footer line in MessageBubble.
      In the footer `View style={styles.bubbleFooter}` (next to Confidence/Copy/time), add a
      conditional line rendered only when `message.usage` is defined and the message is an
      assistant message. Format with thousands separators via `Number.toLocaleString('en-US')`
      (or `n.toLocaleString()`): `Context ~{ctx} · Input {in} · Output {out} · Total {total}`.
      When `message.usage.estimated` is true, prefix the Input/Output/Total numbers with `~`
      (Context always gets `~` regardless). Use a new muted style `styles.tokenLine`
      (color `#555`, fontSize 10) consistent with `assistantTime`. Add a small helper inside
      the file, e.g. `formatTokens(usage)`, to build the string, keeping render JSX clean.
      Files: src/tabs/AITab.tsx
      Verify: `npm run type-check` passes.

- [ ] 9. Full build gate.
      Run the production build to confirm the whole library compiles and emits types with the
      new `AIUsage` export.
      Files: (none — verification only)
      Verify: `npm run build` completes with exit code 0 and no TypeScript errors.

## Verification note (implementation complete)

- **Usage-reporting shape chosen:** resolve-with-object. `AIProvider.chatStream` now resolves
  `Promise<{ text: string; usage?: AIUsage }>`. `onToken` is unchanged. `chat()` stays
  `Promise<string>` and returns `(await this.chatStream(...)).text`, ignoring usage —
  backward-compat preserved; `chat()` still on the interface and still exported from
  `src/index.ts`.
- **Files changed:**
  - `src/types/AITypes.ts` — added `AIUsage` interface; added optional `usage?: AIUsage` to `AIMessage`.
  - `src/index.ts` — added `AIUsage` to the AITypes re-export.
  - `src/ai/tokenEstimate.ts` (new) — shared `estimateTokens(text) = Math.ceil(len/4)` (0 for empty).
  - `src/ai/AIProvider.ts` — `chatStream` return type changed to `{ text, usage? }`; JSDoc updated.
  - `src/ai/OpenAIProvider.ts` — passes `stream_options: { include_usage: true }`; captures the
    final-chunk `chunk.usage` (`choices[0]` guarded with optional chaining so the usage-only chunk
    with an empty choices array doesn't crash the delta loop); builds `AIUsage` (exact from API when
    present, else chars/4 fallback with `estimated: true`); `contextTokens` always estimated via new
    `serializeContext()` helper that `buildSystemPrompt` now reuses so prompt and estimate can't drift;
    `chat()` returns `.text`; connection-error help and empty-response throw preserved.
  - `src/ai/LocalAIProvider.ts` — `chatStream` return type updated to match; still throws (no runtime change).
  - `src/tabs/AITab.tsx` — `handleSend` destructures `{ text: reply, usage }` and sets `usage` on the
    in-flight assistant message by id on the final commit; error path unchanged (no usage); added
    `formatTokens(usage)` helper and a muted `tokenLine` footer rendered only for assistant messages
    with usage (renders nothing when usage is absent, so user/system/errored messages show no line).
- **Type-check:** `npm run type-check` (tsc --noEmit) passes clean, exit 0.
- **Build:** `npm run build` passes clean, exit 0; `AIUsage` emitted in `dist/index.d.ts` and
  `dist/types/AITypes.d.ts`.
- **Not runtime-tested:** exact API-vs-estimate behavior depends on the live LM Studio/OpenAI build
  and can't be verified headlessly here. Verified by type-check + build + code trace: include_usage
  final chunk read without crashing the guarded delta loop; fallback estimate triggers only when
  `apiUsage` is absent; contextTokens computed from the actual sent context chunks; AITab attaches
  usage to the correct message by id and renders nothing when usage is undefined.

## Notes / assumptions

- No test framework is configured in this repo (no jest/vitest; package.json scripts are
  `type-check`, `build`, `clean`, `example*`). Verification therefore uses `npm run type-check`
  and `npm run build`, the project's real quality gates. Do NOT add a test framework for this
  task — it is out of scope and would change the project's toolchain.
- `Example/src/screens/AILabScreen.tsx` routes to the shared AITab and does not call a
  provider, so it needs no change.
- The installed `openai` SDK is `4.104.0` (confirmed). `stream_options` / `include_usage`
  and the final-chunk `usage` field are typed in
  `node_modules/openai/resources/chat/completions/completions.d.ts`, so no cast is needed —
  pass `stream_options: { include_usage: true }` and read `chunk.usage` directly. The
  `CompletionUsage` type is reachable via `OpenAI.Completions.CompletionUsage` /
  `chunk.usage`'s inferred type; typing the `apiUsage` holder as that or `undefined` is fine.
- Context is always labelled approximate with `~`; Input/Output/Total are exact unless
  `estimated` is true, in which case they also get `~`.
