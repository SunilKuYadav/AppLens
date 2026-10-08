/**
 * A captured application error (JavaScript error or unhandled promise rejection).
 */
export interface AppError {
  /** Unique identifier for this error */
  id: string;
  /** Error message */
  message: string;
  /** Optional stack trace */
  stack?: string;
  /** Unix timestamp (ms) when the error was captured */
  timestamp: number;
  /** Whether the error was fatal (uncaught) vs. an unhandled rejection */
  isFatal: boolean;
}
