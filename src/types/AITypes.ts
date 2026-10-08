/**
 * Supported AI provider backends.
 */
export type AIProviderType = 'openai' | 'local';

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
