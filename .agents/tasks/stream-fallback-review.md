# Non-streaming fallback when the server rejects streaming, plus real streaming in the Example shim

`OpenAIProvider.chatStream` now wraps the streaming request and its consume loop in an inner `try`. If that attempt throws an error whose message matches a narrow set of "streaming not supported" phrases, it retries once with a plain `stream: false` request and delivers the whole answer through a single `onToken` call; any other failure (notably a genuine connection error) is rethrown so it still reaches the existing `buildConnectionHelp()`/rethrow path untouched. The Example shim is the other half: it no longer throws on `stream: true` but POSTs a streaming request and returns an async iterable that parses SSE `data:` lines into OpenAI-shaped `{ choices:[{delta:{content}}] }` chunks, with a `getReader`+`TextDecoder` incremental path and a `response.text()` fallback. Usage stays exact when `response.usage` is present (`estimated:false`) and falls back to a chars/4 estimate otherwise (`estimated:true`), while `contextTokens` is always estimated from `serializeContext()`.

Watch for: the fallback trigger is a substring match on the error message; it works because the shim's old throw string and the new design agree, but it is string-coupled across the two files (likely, non-blocking).

**Verdict**: APPROVED

## High-level view

The design keeps `chat()` and `chatStream()` sharing one prompt-building and error-handling path; the only new branch is the inner catch that distinguishes "server can't stream" from everything else. The discrimination is `isStreamingUnsupported()` — four lowercase substring phrases that deliberately do not overlap with the connection-error phrases, so a real network failure never gets silently converted into a non-streaming retry. That separation is the load-bearing part of the change and it holds.

The fallback delivers the entire response in one `onToken(fullText)` call rather than token-by-token, which is exactly the requested behavior ("fall back to complete response shown at last"). Usage accounting is unified across both paths: `contextTokens` is always estimated from the same `serializeContext()` the prompt uses, and input/output/total are exact when the API returns a usage object and chars/4-estimated otherwise.

The shim's streaming path yields OpenAI-shaped chunks and has both an incremental reader path and a buffered `response.text()` fallback for Hermes runtimes without `getReader`. The spec asked for a final usage chunk; the shim does request `include_usage` and passes any `usage`-bearing chunk straight through `parseLine`, so whatever the server emits is forwarded unchanged.

The coupling between the two files is a string: the shim's old throw (`"Streaming is not supported in the React Native shim."`) is what the provider's phrase list was written to catch. The shim no longer throws that string, so the live trigger now comes from real servers that reject streaming. The match set is reasonable but there is no shared constant tying the two sides together.

<details>
<summary>Issues (2)</summary>

1. **String-coupled fallback trigger** — the non-streaming retry fires only when the error message contains one of four hardcoded phrases; a server that rejects streaming with different wording (e.g. a 400 "stream unsupported for this model") would not trigger the fallback and would surface as a request failure. Non-blocking; consider widening or documenting the contract.
2. **Shim streaming behavior unverifiable headlessly** — true incremental vs batched delivery depends on a live LM Studio server and cannot be confirmed by type-check/build. Non-blocking; flagged in the verification note. Worth a manual smoke test against a real server.

</details>

<details>
<summary>Details</summary>

### Discriminating "can't stream" from "can't connect"

The inner catch calls `isStreamingUnsupported(message)` and only falls back when it returns true; otherwise it `throw streamErr`, re-raising the original error so the outer catch handles it exactly as before. The two phrase sets are disjoint by construction — the fallback set is `streaming is not supported` / `stream is not supported` / `does not support stream` / `stream not supported`, and the connection set is `network request failed` / `connection error` / `failed to fetch` / `econnrefused`. A `Network request failed` from React Native fetch therefore cannot be misread as a streaming-unsupported signal; it rethrows and routes through `isConnectionError()`/`isLocalHost()`/`buildConnectionHelp()` unchanged (confirmed).

The trigger is a substring match on free-form error text. The shim previously threw `"Streaming is not supported in the React Native shim."`, whose lowercase form contains `streaming is not supported`, but the two files are coupled only by that string — nothing enforces that a future server's "no streaming" error uses one of the four phrases. A server returning, say, HTTP 400 with `"streaming unsupported"` (no "is"/"not" in that order) would miss all four and surface as a hard failure instead of falling back (likely). Not blocking, but a shared constant or a broader match would make the contract explicit.

### Single-callback fallback delivery and usage accounting

In the fallback branch `fullText` is taken from `response.choices[0]?.message?.content ?? ''`, guarded against empty, then handed to the caller via one `onToken(fullText)` call — the whole answer at once, matching "fall back to complete response shown at last" (confirmed). The post-branch empty-response guard is redundant with the in-branch guard on the fallback path but still correctly covers the streaming path where no in-branch guard runs.

Usage is computed once, after both paths converge. `contextTokens` is unconditionally `estimateTokens(serializeContext(context))`, so it is always an estimate derived from the same serialization the system prompt uses — the two cannot drift. When `apiUsage` is set (streaming final chunk or `response.usage` on the fallback), input/output/total come straight from `prompt_tokens`/`completion_tokens`/`total_tokens` with `estimated:false`. Otherwise input is estimated from `systemPrompt + conversation joined` and output from `fullText`, with `estimated:true`. This matches the spec exactly (confirmed).

### Shim: SSE parsing and the two read paths

```
create({stream:true}) ──► _createStream
                             │ POST stream:true, stream_options.include_usage
                             ▼
                 response.ok? ──no──► throw "LM Studio error <status>: <msg>"
                             │yes
            getReader & TextDecoder available?
             ┌───────yes───────┐        └────no────┐
             ▼                            ▼
   reader.read() loop,            await response.text(),
   decode, split on \n,           split on \n,
   parseLine per line,            parseLine per line,
   flush trailing partial         yield each
             └──────────┬───────────────┘
                        ▼
        yields { choices:[{delta:{content}}] } chunks
        (usage chunk forwarded as-is)
```

`parseLine` strips `data:`, stops on `[DONE]`, and JSON-parses the remainder, returning `null` for blank/non-data/unparseable lines so the loops skip them. The incremental path keeps a `buffer` across reads and only emits complete `\n`-terminated lines, flushing any trailing partial after the stream ends — correct handling of chunk boundaries that don't align to line breaks (confirmed). The usage chunk is not special-cased; whatever the server sends with `include_usage` passes through `parseLine` and is yielded, which is what the provider's `if (chunk.usage)` capture expects (confirmed). The non-streaming branch, its `console.log`, error shapes, and the `module.exports` tail are unchanged (confirmed via diff).

The one thing build/type-check cannot establish is whether delivery is genuinely incremental against a real server versus effectively batched — that needs a live LM Studio run. The verification note calls this out explicitly (possible; environmental, not a code defect).

### Verification evidence

The verification note records `npm run type-check` (tsc --noEmit) exit 0 as the primary gate, `npm run build` exit 0, and `node --check Example/shims/openai.js` exit 0 for the plain-JS shim. It also walks the fallback trigger, connection-error separation, `chat()` return type and export, usage computation, and the shim's two read paths against the actual code. The claims line up with what I read in the source and the diffs, so I did not re-run the suites. `LocalAIProvider.ts` shows no diff against the previous commit, confirming it is untouched; `OpenAIProvider` remains exported from `src/index.ts`.

</details>

<details>
<summary>File map</summary>

- `src/ai/OpenAIProvider.ts` — adds inner try/catch in `chatStream` with `isStreamingUnsupported()` gate and single-request non-streaming fallback; unified usage accounting; `chat()` unchanged.
- `Example/shims/openai.js` — `create` no longer throws on `stream:true`; adds `_createStream` with SSE parsing, incremental `getReader`+`TextDecoder` path, and `response.text()` fallback.
- `.agents/tasks/stream-fallback-verification.md` — coder's recorded type-check/build/syntax results and logic trace.

Full diff: `git diff HEAD~1`.

</details>
