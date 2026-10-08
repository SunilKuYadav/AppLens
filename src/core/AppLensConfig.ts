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
  /** Enable capture of uncaught errors and unhandled promise rejections */
  errors: boolean;
  /** Enable the AI assistant feature */
  ai: boolean;
  /** Which AI backend to use */
  aiProvider: AIProviderType;
  /** API key for the AI provider (never logged). Not required for lmstudio. */
  aiApiKey?: string;
  /** Model identifier — e.g. 'gpt-4o' for OpenAI, or the model name shown in LM Studio */
  aiModel?: string;
  /** Override the base URL for the AI provider (e.g. 'http://127.0.0.1:1234/v1' for LM Studio) */
  aiBaseURL?: string;
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
  /** Reserved: persist captured logs across reloads (not yet implemented) */
  persistLogs?: boolean;
  /** Enable AppLens's own verbose diagnostic logging */
  verboseLogging?: boolean;
  /** Field/header names to redact from captured data */
  redaction?: {
    /** Header names to redact (case-insensitive) */
    headers?: string[];
    /** Object field names to redact (case-insensitive) */
    fields?: string[];
  };
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
  errors: true,
  ai: true,
  aiProvider: 'openai',
  aiApiKey: undefined,
  aiModel: undefined,
  aiBaseURL: undefined,
  redactHeaders: REDACTED_HEADERS,
  projectRoot: undefined,
  maxNetworkEntries: 500,
  maxLogEntries: 1000,
  maxEventEntries: 500,
  persistLogs: false,
  verboseLogging: false,
  redaction: undefined,
};
