import OpenAI from 'openai';
import { AIProvider } from './AIProvider';
import { AIMessage, ContextChunk } from '../types/AITypes';

/**
 * AI provider that calls OpenAI's chat completions API (model: gpt-4o).
 *
 * Context chunks are serialised into a system prompt that precedes the
 * developer's conversation, giving the model awareness of the app's
 * current runtime state.
 */
export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, model: string = 'gpt-4o', baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
    // Keep the resolved base URL on the instance so error messages can name it.
    this.baseURL = baseURL ?? 'https://api.openai.com/v1';
    this.client = new OpenAI({
      apiKey: apiKey || 'lm-studio', // LM Studio ignores the key but the SDK requires a non-empty string
      ...(baseURL ? { baseURL } : {}),
    });
  }

  isConfigured(): boolean {
    // 'lm-studio' is the dummy key used for LM Studio — always considered configured
    return this.apiKey.length > 0;
  }

  async chat(messages: AIMessage[], context: ContextChunk[]): Promise<string> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);

      // Map AIMessage[] to OpenAI message format.
      // We skip 'system' role messages from the conversation itself because
      // the system context is injected separately via the system prompt above.
      const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages
          .filter((m) => m.role !== 'system')
          .map(
            (m): OpenAI.Chat.ChatCompletionMessageParam => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }),
          ),
      ];

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: openAIMessages,
        stream: false,
      });

      const content = response.choices[0]?.message?.content;
      if (content == null) {
        throw new Error('OpenAI returned an empty response.');
      }

      return content;
    } catch (err: unknown) {
      const base = 'AppLens AI: OpenAI request failed';
      if (err instanceof Error) {
        // When the request never reached the server AND we're pointed at a
        // local/loopback host, surface an actionable, platform-specific hint.
        if (this.isConnectionError(err.message) && this.isLocalHost()) {
          throw new Error(this.buildConnectionHelp());
        }
        throw new Error(`${base} — ${err.message}`);
      }
      throw new Error(`${base}.`);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Detect a failure where the request never reached the server. React Native
   * fetch surfaces these as 'Network request failed'; the openai SDK may wrap
   * them as an APIConnectionError whose message contains 'Connection error'.
   */
  private isConnectionError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('network request failed') ||
      m.includes('connection error') ||
      m.includes('failed to fetch') ||
      m.includes('econnrefused')
    );
  }

  /**
   * Parse the host/port out of this.baseURL with a tolerant, dependency-free
   * approach. The global URL may not exist in all RN runtimes, so we use a
   * regex rather than the URL constructor.
   */
  private parseHostPort(): { host: string; port: string } {
    const match = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)(?::(\d+))?/i.exec(
      this.baseURL,
    );
    const host = match?.[1] ?? '';
    const port = match?.[2] ?? '';
    return { host, port };
  }

  /**
   * True when the resolved base URL points at a loopback / LAN host:
   * 127.0.0.1, localhost, 10.0.2.2, a 192.168.* address, or a 10.* address.
   */
  private isLocalHost(): boolean {
    const { host } = this.parseHostPort();
    if (host.length === 0) {
      return false;
    }
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '10.0.2.2' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.')
    );
  }

  /**
   * Build a concise, multi-line, actionable message explaining the common
   * local-LLM connectivity traps (emulator loopback, LM Studio binding,
   * cleartext http) and the correct per-platform base URL.
   */
  private buildConnectionHelp(): string {
    const { port } = this.parseHostPort();
    const resolvedPort = /^\d+$/.test(port) ? port : '1234';
    return [
      `Cannot reach the AI server at ${this.baseURL}.`,
      `• Android emulator: use http://10.0.2.2:${resolvedPort}/v1 instead of 127.0.0.1 — 127.0.0.1 is the emulator itself, not your computer.`,
      `• iOS simulator: 127.0.0.1 works and points at your Mac.`,
      `• Physical device: use your computer's LAN IP (e.g. http://192.168.x.x:${resolvedPort}/v1).`,
      `• Make sure LM Studio is running and 'Serve on Local Network' is enabled so it binds 0.0.0.0, not just localhost.`,
      `• On Android, cleartext http may be blocked — ensure usesCleartextTraffic is allowed in the debug manifest.`,
    ].join('\n');
  }

  /**
   * Build a system prompt by prepending a developer-expert persona and then
   * appending each context chunk as a labelled text block.
   */
  private buildSystemPrompt(chunks: ContextChunk[]): string {
    const persona = [
      'You are AppLens AI — an expert developer assistant embedded inside a React Native application.',
      'The context blocks below contain REAL, LIVE data captured from the running application:',
      'network requests, console logs, application events, and the source-code structure.',
      'When context blocks are provided, use them to give specific, accurate answers.',
      'Do NOT say you lack access to runtime data — it is provided in the context blocks below.',
      'Do NOT say you cannot see the app or project — the knowledge graph block describes exactly what is in it.',
      '',
      'Your answers should be evidence-based. Clearly distinguish between confirmed facts (from context),',
      'strong evidence, possible causes, and speculation. Reference specific files, components,',
      'functions, and API endpoints when they appear in the context.',
      '',
      'Format your responses with clear sections. Use plain text — avoid markdown that would not render',
      'well in a mobile developer console.',
      '',
      'IMPORTANT: End every answer with a final line formatted EXACTLY as one of:',
      '"Confidence: High", "Confidence: Medium", or "Confidence: Low"',
      '— reflecting how well the provided context supports your answer.',
    ].join('\n');

    if (chunks.length === 0) {
      return persona + '\n\nNote: No runtime context was captured yet. The app may just have started or no network/log activity has occurred.';
    }

    const contextBlocks = chunks
      .map((chunk) => {
        const label = chunk.type.toUpperCase();
        return `[${label} CONTEXT]\n${chunk.content}`;
      })
      .join('\n\n');

    return `${persona}\n\n--- Runtime Context ---\n\n${contextBlocks}`;
  }
}
