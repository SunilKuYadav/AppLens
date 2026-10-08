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
 * - 'openai'   — OpenAIProvider with the configured API key
 * - 'lmstudio' — OpenAIProvider pointed at LM Studio's local OpenAI-compatible endpoint
 * - 'local'    — LocalAIProvider stub
 */
export function createAIProvider(config: AppLensConfig): AIProvider {
  if (config.aiProvider === 'lmstudio') {
    const baseURL = config.aiBaseURL ?? 'http://127.0.0.1:1234/v1';
    // LM Studio uses just-in-time loading — pass 'lm-studio' as a dummy key
    return new OpenAIProvider('lm-studio', config.aiModel ?? 'local-model', baseURL);
  }

  if (
    config.aiProvider === 'openai' &&
    typeof config.aiApiKey === 'string' &&
    config.aiApiKey.length > 0
  ) {
    return new OpenAIProvider(
      config.aiApiKey,
      config.aiModel ?? 'gpt-4o',
      config.aiBaseURL,
    );
  }

  return new LocalAIProvider();
}
