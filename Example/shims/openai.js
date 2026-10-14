/**
 * React Native compatible shim for the `openai` package.
 *
 * The real openai SDK targets Node.js and uses shims (http, stream, etc.)
 * that don't exist in Hermes. This shim re-implements the one method
 * AppLens uses — chat.completions.create() — via React Native's global fetch.
 *
 * Supports non-streaming chat completions only (stream: false).
 * Returns a response object shaped exactly like the OpenAI SDK's response so
 * OpenAIProvider.chat() can access response.choices[0].message.content.
 */

class Completions {
  constructor(baseURL, apiKey) {
    this._baseURL = (baseURL || 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
    this._apiKey = apiKey || 'lm-studio';
  }

  async create({ model, messages, stream }) {
    if (stream) {
      return this._createStream({ model, messages });
    }

    const url = this._baseURL + '/chat/completions';

    console.log('[AppLens AI] POST', url, 'model:', model);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this._apiKey,
        },
        body: JSON.stringify({ model, messages, stream: false }),
      });
    } catch (networkErr) {
      console.error('[AppLens AI] fetch failed:', networkErr.message);
      throw new Error('Network error reaching LM Studio: ' + networkErr.message);
    }

    let body;
    try {
      body = await response.json();
    } catch (parseErr) {
      const text = await response.text().catch(() => '(unreadable)');
      throw new Error(
        'LM Studio returned non-JSON (status ' + response.status + '): ' + text.slice(0, 200),
      );
    }

    if (!response.ok) {
      const msg = body?.error?.message || JSON.stringify(body);
      throw new Error('LM Studio error ' + response.status + ': ' + msg);
    }

    // body is already shaped like an OpenAI response:
    // { choices: [{ message: { role, content } }], ... }
    return body;
  }

  /**
   * Streaming path. POSTs with stream:true and returns an async iterable that
   * yields OpenAI-style chunk objects for each SSE `data:` line.
   *
   * React Native's fetch under Hermes may not expose a web ReadableStream, so
   * we read incrementally via response.body.getReader() + TextDecoder when
   * available and otherwise fall back to buffering the whole body with
   * response.text() and parsing it after the fact.
   */
  async _createStream({ model, messages }) {
    const url = this._baseURL + '/chat/completions';

    console.log('[AppLens AI] POST', url, 'model:', model);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this._apiKey,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
    } catch (networkErr) {
      console.error('[AppLens AI] fetch failed:', networkErr.message);
      throw new Error('Network error reaching LM Studio: ' + networkErr.message);
    }

    if (!response.ok) {
      let msg;
      try {
        const errBody = await response.json();
        msg = (errBody && errBody.error && errBody.error.message) || JSON.stringify(errBody);
      } catch (parseErr) {
        msg = await response.text().catch(() => '(unreadable)');
      }
      throw new Error('LM Studio error ' + response.status + ': ' + msg);
    }

    const canReadIncrementally =
      response.body &&
      typeof response.body.getReader === 'function' &&
      typeof TextDecoder !== 'undefined';

    // Parse a single SSE line into a chunk object, or null if it is not a
    // data line / is the DONE sentinel.
    function parseLine(line) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.indexOf('data:') !== 0) {
        return null;
      }
      const payload = trimmed.slice('data:'.length).trim();
      if (payload === '[DONE]') {
        return null;
      }
      try {
        return JSON.parse(payload);
      } catch (jsonErr) {
        return null;
      }
    }

    if (canReadIncrementally) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      return {
        async *[Symbol.asyncIterator]() {
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              const chunk = parseLine(line);
              if (chunk) {
                yield chunk;
              }
            }
          }
          // Flush any trailing partial line.
          const tail = parseLine(buffer);
          if (tail) {
            yield tail;
          }
        },
      };
    }

    // Fallback: no incremental reader available — buffer the whole SSE payload
    // and parse it after the fact, still yielding through the async iterator.
    const text = await response.text();
    return {
      async *[Symbol.asyncIterator]() {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const chunk = parseLine(lines[i]);
          if (chunk) {
            yield chunk;
          }
        }
      },
    };
  }
}

class Chat {
  constructor(baseURL, apiKey) {
    this.completions = new Completions(baseURL, apiKey);
  }
}

class OpenAI {
  constructor({ apiKey, baseURL } = {}) {
    this.chat = new Chat(baseURL, apiKey);
  }
}

module.exports = OpenAI;
module.exports.default = OpenAI;
