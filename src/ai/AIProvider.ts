import { AIMessage, ContextChunk } from '../types/AITypes';
import { AppLensConfig } from '../core/AppLensConfig';
import { OpenAIProvider } from './OpenAIProvider';
import { LocalAIProvider } from './LocalAIProvider';

/**
 * Common interface every AI backend must implement.
 */
export interface AIProvider {
  /**
   * Send a conversation to the AI backend and return the assistant's reply.
   *
   * @param messages - The conversation history (user + assistant turns)
   * @param context  - Relevant runtime/code context chunks to inject into the prompt
   */
  chat(messages: AIMessage[], context: ContextChunk[]): Promise<string>;

  /**
   * Returns true when the provider is ready to accept requests.
   * A provider is "configured" when it has the credentials it needs.
   */
  isConfigured(): boolean;
}

/**
 * Factory that picks the right AI provider based on the AppLens configuration.
 *
 * - Returns an OpenAIProvider when `aiProvider === 'openai'` and `aiApiKey` is set.
 * - Falls back to LocalAIProvider (stub) in all other cases.
 */
export function createAIProvider(config: AppLensConfig): AIProvider {
  if (
    config.aiProvider === 'openai' &&
    typeof config.aiApiKey === 'string' &&
    config.aiApiKey.length > 0
  ) {
    return new OpenAIProvider(
      config.aiApiKey,
      config.aiModel ?? 'gpt-4o',
    );
  }

  return new LocalAIProvider();
}
