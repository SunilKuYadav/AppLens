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

  constructor(apiKey: string, model: string = 'gpt-4o', baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
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
        throw new Error(`${base} — ${err.message}`);
      }
      throw new Error(`${base}.`);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

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
