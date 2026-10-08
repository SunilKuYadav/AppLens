/**
 * Headers that are redacted by default to protect sensitive information.
 */
export const REDACTED_HEADERS: string[] = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-secret',
];

/**
 * Represents the context in which a network request was made —
 * which screen, hook, service, or event triggered it.
 */
export interface NetworkRequestContext {
  screen?: string;
  hook?: string;
  service?: string;
  event?: string;
}

/**
 * A captured network request and its corresponding response.
 */
export interface NetworkRequest {
  /** Unique identifier for this request */
  id: string;
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** Full request URL */
  url: string;
  /** HTTP status code (e.g. 200, 404) */
  status?: number;
  /** HTTP status text (e.g. "OK", "Not Found") */
  statusText?: string;
  /** Request headers (sensitive ones are redacted) */
  requestHeaders: Record<string, string>;
  /** Response headers (sensitive ones are redacted) */
  responseHeaders: Record<string, string>;
  /** Request body, truncated to 50KB */
  requestBody?: string;
  /** Response body, truncated to 50KB */
  responseBody?: string;
  /** Duration in milliseconds from send() to response */
  duration?: number;
  /** Unix timestamp (ms) when the request was initiated */
  timestamp: number;
  /** Error details if the request failed */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  /** Current lifecycle state of the request */
  state: 'pending' | 'complete' | 'error';
  /** Source context that triggered this request */
  context?: NetworkRequestContext;
}
