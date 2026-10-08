/**
 * Supported console log levels.
 */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * A single captured console log entry.
 */
export interface LogEntry {
  /** Unique identifier for this log entry */
  id: string;
  /** Severity level of the log */
  level: LogLevel;
  /** Primary message (stringified first argument) */
  message: string;
  /** All arguments passed to the console call */
  args: unknown[];
  /** Unix timestamp (ms) when the log was captured */
  timestamp: number;
  /** Stack trace at the point of the log call */
  stack?: string;
}
