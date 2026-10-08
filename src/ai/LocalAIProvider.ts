import { AIProvider } from './AIProvider';
import { AIMessage, ContextChunk } from '../types/AITypes';

/**
 * Stub AI provider used when no external AI backend is configured.
 *
 * isConfigured() always returns false, indicating that the developer
 * needs to supply an API key via AppLens.initialize().
 */
export class LocalAIProvider implements AIProvider {
  isConfigured(): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async chat(_messages: AIMessage[], _context: ContextChunk[]): Promise<string> {
    throw new Error(
      'No AI provider configured. Add aiApiKey to AppLens.initialize() to enable AI features.',
    );
  }
}
