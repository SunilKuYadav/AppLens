/**
 * Supported AI provider backends.
 * - 'openai'    — OpenAI API (requires aiApiKey)
 * - 'lmstudio'  — LM Studio local server (OpenAI-compatible, no key needed)
 * - 'local'     — stub for on-device inference
 */
export type AIProviderType = 'openai' | 'lmstudio' | 'local';

/**
 * Token usage for a single AI exchange.
 *
 * `contextTokens` is always an ESTIMATE of how much the injected runtime
 * context contributes to the prompt (chars/4 heuristic over the serialized
 * context chunks). `inputTokens`/`outputTokens`/`totalTokens` are EXACT values
 * reported by the API when available; when the server omits usage they fall
 * back to the same chars/4 heuristic and `estimated` is set to `true`.
 */
export interface AIUsage {
  /** Estimated tokens contributed by the injected runtime context (always an estimate) */
  contextTokens: number;
  /** Prompt tokens — exact from the API unless `estimated` is true */
  inputTokens: number;
  /** Completion tokens — exact from the API unless `estimated` is true */
  outputTokens: number;
  /** Total tokens — exact from the API unless `estimated` is true */
  totalTokens: number;
  /** True when input/output/total came from the chars/4 fallback instead of the API */
  estimated: boolean;
}

/**
 * A single message in an AI conversation.
 */
export interface AIMessage {
  /** Unique identifier for this message */
  id: string;
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Text content of the message */
  content: string;
  /** Unix timestamp (ms) when the message was created */
  timestamp: number;
  /** Token usage for the exchange that produced this message (assistant messages only) */
  usage?: AIUsage;
}

/**
 * A full AI conversation session (a list of messages).
 */
export interface AIConversation {
  /** Ordered list of messages in this conversation */
  messages: AIMessage[];
}

/**
 * A chunk of context retrieved from the application's knowledge graph
 * or runtime data to be injected into an AI prompt.
 */
export interface ContextChunk {
  /** The kind of context this chunk represents */
  type: 'network' | 'log' | 'event' | 'graph' | 'code';
  /** Serialized content to include in the AI prompt */
  content: string;
  /** Relevance score used to rank/select chunks (0–1) */
  relevanceScore: number;
}
