# Verification — Streaming graceful fallback + Example shim real streaming

## Commands run (repo root `/Users/sunilkumar/Desktop/project/AppLens/AppLens`)

- `npm run type-check` (tsc --noEmit) → exit 0, clean. Primary gate.
- `npm run build` (tsc -p tsconfig.build.json) → exit 0.
- `node --check Example/shims/openai.js` → exit 0 (shim is plain JS, outside `src/`, intentionally not type-checked).

## Logic trace

(a) **Thrown 'streaming is not supported' triggers exactly one non-streaming retry.**
`chatStream` wraps the `create({ stream: true })` call plus the `for await` loop in an
inner `try`. On error, `isStreamingUnsupported(message)` runs a case-insensitive substring
match on the four phrases. If it matches, a single `create({ model, messages, stream: false })`
(no `stream_options`) runs once, `fullText = response.choices[0]?.message?.content ?? ''`,
empty-response guard applied, then `onToken(fullText)` is called exactly once and the text is
returned via `{ text, usage }`. The shim's message
`"Streaming is not supported in the React Native shim."` matches `streaming is not supported`.

(b) **Genuine connection errors are NOT misread as a streaming-fallback trigger.**
When `isStreamingUnsupported` returns false, the inner `catch` does `throw streamErr`,
re-raising the original error. It propagates to the outer `catch`, which routes through
`isConnectionError()`/`isLocalHost()`/`buildConnectionHelp()` and otherwise rethrows
`"AppLens AI: OpenAI request failed — <msg>"` — unchanged from before. The fallback match
phrases do not overlap with the connection-error phrases
(network request failed / connection error / failed to fetch / econnrefused).

(c) **chat() still returns Promise<string> and is still exported.**
`chat()` is untouched: `return (await this.chatStream(...)).text;`. `chatStream` signature
still resolves `{ text: string; usage?: AIUsage }`. `OpenAIProvider` is still exported from
`src/index.ts` (line 30). `type-check` passing confirms the types.

(d) **Usage: exact when present, estimated (chars/4) otherwise; contextTokens always estimated.**
`contextTokens = estimateTokens(this.serializeContext(context))` runs unconditionally for both
the streaming and fallback paths. In the fallback, `apiUsage = response.usage ?? undefined`.
Downstream, if `apiUsage` is set, `usage` uses `prompt_tokens`/`completion_tokens`/`total_tokens`
with `estimated: false`; otherwise it estimates input from `systemPrompt + conversation joined`
and output from `fullText` via the existing `estimateTokens`, `estimated: true`. The same shared
`estimateTokens` import and `serializeContext()` method are reused — no duplication.

(e) **Shim no longer throws on stream:true; yields OpenAI-shaped delta chunks; getReader-missing fallback present.**
`Completions.create` now returns `this._createStream(...)` when `stream` is truthy.
`_createStream` POSTs `{ model, messages, stream: true, stream_options: { include_usage: true } }`,
keeps the `console.log('[AppLens AI] POST', ...)` line and the same network-error / non-OK error
shapes. It returns an object with `[Symbol.asyncIterator]`. Path A (incremental): used when
`response.body.getReader` is a function AND `TextDecoder` is defined — reads with a reader +
TextDecoder, buffers, splits on `\n`, keeps the trailing partial line across reads, flushes the
tail. Path B (fallback): when getReader/TextDecoder are unavailable, awaits `response.text()` and
parses the whole SSE payload. Both share one `parseLine` helper that strips `data:`, stops on
`[DONE]`, and JSON-parses the remainder, yielding chunks as-is. The non-streaming branch and its
`console.log`/error handling are unchanged, and the `module.exports` tail is unchanged.

Note: true incremental vs batched streaming behavior in the shim cannot be verified headlessly
(no guaranteed LM Studio server in this environment); verification is build/type-check/syntax —
the project's real gate.
