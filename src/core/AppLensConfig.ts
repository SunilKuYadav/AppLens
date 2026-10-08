import { AIProviderType } from '../types/AITypes';
import { REDACTED_HEADERS } from '../types/NetworkTypes';

/**
 * Full configuration for the AppLens library.
 * All fields have sensible defaults — only override what you need.
 */
export interface AppLensConfig {
  /** Master switch — when false, AppLens does nothing */
  enabled: boolean;
  /** Enable network request interception and logging */
  network: boolean;
  /** Enable console output capture */
  console: boolean;
  /** Enable application event tracking */
  events: boolean;
  /** Enable the AI assistant feature */
  ai: boolean;
  /** Which AI backend to use */
  aiProvider: AIProviderType;
  /** API key for the AI provider (never logged) */
  aiApiKey?: string;
  /** Model identifier (e.g. 'gpt-4o') */
  aiModel?: string;
  /** Header names whose values should be replaced with '[REDACTED]' */
  redactHeaders: string[];
  /** Absolute path to the application's project root for source indexing */
  projectRoot?: string;
  /** Maximum number of network entries kept in memory (ring buffer) */
  maxNetworkEntries: number;
  /** Maximum number of log entries kept in memory (ring buffer) */
  maxLogEntries: number;
  /** Maximum number of event entries kept in memory (ring buffer) */
  maxEventEntries: number;
}

/**
 * Default configuration applied when AppLens.initialize() is called
 * without providing explicit values.
 */
export const DEFAULT_CONFIG: AppLensConfig = {
  enabled: true,
  network: true,
  console: true,
  events: true,
  ai: true,
  aiProvider: 'openai',
  aiApiKey: undefined,
  aiModel: undefined,
  redactHeaders: REDACTED_HEADERS,
  projectRoot: undefined,
  maxNetworkEntries: 500,
  maxLogEntries: 1000,
  maxEventEntries: 500,
};
