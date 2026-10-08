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
      throw new Error('Streaming is not supported in the React Native shim.');
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
