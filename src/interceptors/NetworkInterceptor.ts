import { NetworkRequest } from '../types/NetworkTypes';
import { AppLensStorage } from '../storage/AppLensStorage';
import { AppLensConfig } from '../core/AppLensConfig';

/** Maximum body size captured per request/response (50 KB). */
const MAX_BODY_BYTES = 50 * 1024;

/** Generate a simple unique ID without external deps. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Truncate a string to MAX_BODY_BYTES characters. */
function truncateBody(body: string): string {
  if (body.length > MAX_BODY_BYTES) {
    return body.slice(0, MAX_BODY_BYTES) + '…[truncated]';
  }
  return body;
}

/**
 * Redact sensitive header values in place (case-insensitive key matching).
 * Returns a new object — never mutates the original.
 */
function redactHeaders(
  headers: Record<string, string>,
  redactList: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = redactList.includes(key.toLowerCase())
      ? '[REDACTED]'
      : value;
  }
  return result;
}

/** Parse a raw header string (from XHR.getAllResponseHeaders) into a map. */
function parseResponseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) {
    return headers;
  }
  for (const line of raw.trim().split(/\r?\n/)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  return headers;
}

// ─── Private augmentation ─────────────────────────────────────────────────
// Attach AppLens metadata to XHR instances without altering the public type.
interface XHRWithMeta extends XMLHttpRequest {
  __applensId?: string;
  __applensMethod?: string;
  __applensUrl?: string;
  __applensRequestHeaders?: Record<string, string>;
}

/**
 * Monkey-patches the global XMLHttpRequest and fetch to capture network
 * activity into AppLensStorage.
 *
 * Sensitive headers are redacted. Request/response bodies are truncated at
 * 50 KB. Interceptors can be safely attached and detached.
 */
export class NetworkInterceptor {
  private storage: AppLensStorage;
  private config: AppLensConfig;
  private attached: boolean = false;

  // ─── XHR originals ────────────────────────────────────────────────────────
  private originalXHROpen: ((
    method: string,
    url: string,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) => void) | null = null;

  private originalXHRSend: ((body?: string | null) => void) | null = null;

  private originalXHRSetRequestHeader:
    | ((header: string, value: string) => void)
    | null = null;

  // ─── Fetch original ───────────────────────────────────────────────────────
  private originalFetch: typeof global.fetch | null = null;

  constructor(storage: AppLensStorage, config: AppLensConfig) {
    this.storage = storage;
    this.config = config;
  }

  /** Attach XHR and fetch interceptors. Safe to call multiple times. */
  attach(): void {
    if (this.attached) {
      return;
    }
    this.patchXHR();
    this.patchFetch();
    this.attached = true;
  }

  /** Restore the original XHR and fetch implementations. */
  detach(): void {
    if (!this.attached) {
      return;
    }
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen as typeof XMLHttpRequest.prototype.open;
    }
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend as typeof XMLHttpRequest.prototype.send;
    }
    if (this.originalXHRSetRequestHeader) {
      XMLHttpRequest.prototype.setRequestHeader =
        this.originalXHRSetRequestHeader as typeof XMLHttpRequest.prototype.setRequestHeader;
    }
    if (this.originalFetch) {
      global.fetch = this.originalFetch;
    }
    this.originalXHROpen = null;
    this.originalXHRSend = null;
    this.originalXHRSetRequestHeader = null;
    this.originalFetch = null;
    this.attached = false;
  }

  // ─── XHR patch ────────────────────────────────────────────────────────────

  private patchXHR(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const interceptor = this;

    // Save originals using the narrowed types we declared above
    this.originalXHROpen = XMLHttpRequest.prototype.open as unknown as (
      method: string,
      url: string,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) => void;

    this.originalXHRSend = XMLHttpRequest.prototype.send as unknown as (
      body?: string | null,
    ) => void;

    this.originalXHRSetRequestHeader =
      XMLHttpRequest.prototype.setRequestHeader as unknown as (
        header: string,
        value: string,
      ) => void;

    const originalOpen = this.originalXHROpen;
    const originalSend = this.originalXHRSend;
    const originalSetRequestHeader = this.originalXHRSetRequestHeader;

    // Override open() to capture method + URL
    // Use 'any' for the prototype assignment to avoid RN XHR overload conflicts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (XMLHttpRequest.prototype as any).open = function (
      method: string,
      url: string,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      const meta = this as XHRWithMeta;
      meta.__applensId = generateId();
      meta.__applensMethod = method.toUpperCase();
      meta.__applensUrl = url;
      meta.__applensRequestHeaders = {};

      if (async === undefined) {
        originalOpen.call(this, method, url);
      } else if (username === undefined) {
        originalOpen.call(this, method, url, async);
      } else if (password === undefined) {
        originalOpen.call(this, method, url, async, username);
      } else {
        originalOpen.call(this, method, url, async, username, password);
      }
    };

    // Override setRequestHeader() to track request headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (XMLHttpRequest.prototype as any).setRequestHeader = function (
      header: string,
      value: string,
    ): void {
      const meta = this as XHRWithMeta;
      if (meta.__applensRequestHeaders) {
        meta.__applensRequestHeaders[header.toLowerCase()] = value;
      }
      originalSetRequestHeader.call(this, header, value);
    };

    // Override send() to start timing and attach load/error handlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (XMLHttpRequest.prototype as any).send = function (
      body?: string | null,
    ): void {
      const meta = this as XHRWithMeta;
      const id = meta.__applensId ?? generateId();
      const method = meta.__applensMethod ?? 'GET';
      const url = meta.__applensUrl ?? '';
      const rawRequestHeaders = meta.__applensRequestHeaders ?? {};
      const startTime = Date.now();

      const requestHeaders = redactHeaders(
        rawRequestHeaders,
        interceptor.config.redactHeaders,
      );

      const requestBody =
        body != null ? truncateBody(String(body)) : undefined;

      const request: NetworkRequest = {
        id,
        method,
        url,
        requestHeaders,
        responseHeaders: {},
        requestBody,
        timestamp: startTime,
        state: 'pending',
      };

      interceptor.storage.addNetworkRequest(request);

      const xhrInstance = this as XHRWithMeta;

      xhrInstance.addEventListener('load', function (this: XMLHttpRequest) {
        const duration = Date.now() - startTime;
        const rawResponseHeaders = parseResponseHeaders(
          this.getAllResponseHeaders(),
        );
        const responseHeaders = redactHeaders(
          rawResponseHeaders,
          interceptor.config.redactHeaders,
        );
        const responseBody = truncateBody(
          typeof this.responseText === 'string' ? this.responseText : '',
        );

        interceptor.storage.updateNetworkRequest(id, {
          status: this.status,
          statusText: this.statusText,
          responseHeaders,
          responseBody,
          duration,
          state: this.status >= 400 ? 'error' : 'complete',
        });
      });

      xhrInstance.addEventListener('error', function () {
        const duration = Date.now() - startTime;
        interceptor.storage.updateNetworkRequest(id, {
          duration,
          state: 'error',
          error: {
            message: 'Network request failed',
          },
        });
      });

      xhrInstance.addEventListener('timeout', function () {
        const duration = Date.now() - startTime;
        interceptor.storage.updateNetworkRequest(id, {
          duration,
          state: 'error',
          error: {
            message: 'Network request timed out',
          },
        });
      });

      originalSend.call(this, body ?? null);
    };
  }

  // ─── Fetch patch ──────────────────────────────────────────────────────────

  private patchFetch(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const interceptor = this;
    this.originalFetch = global.fetch;
    const originalFetch = this.originalFetch;

    global.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const id = generateId();
      const startTime = Date.now();

      // Determine URL and method from the input
      let url: string;
      let method: string;

      if (typeof input === 'string') {
        url = input;
        method = (init?.method ?? 'GET').toUpperCase();
      } else if (input instanceof URL) {
        url = input.toString();
        method = (init?.method ?? 'GET').toUpperCase();
      } else {
        // Request object
        url = input.url;
        method = input.method.toUpperCase();
      }

      // Collect request headers into a plain map
      const rawRequestHeaders: Record<string, string> = {};

      const collectHeaders = (headers: HeadersInit_ | undefined): void => {
        if (!headers) {
          return;
        }
        if (typeof (headers as Headers).forEach === 'function') {
          (headers as Headers).forEach((value: string, key: string) => {
            rawRequestHeaders[key.toLowerCase()] = value;
          });
        } else if (Array.isArray(headers)) {
          (headers as string[][]).forEach(([key, value]: string[]) => {
            if (key) {
              rawRequestHeaders[key.toLowerCase()] = value ?? '';
            }
          });
        } else {
          Object.entries(headers as Record<string, string>).forEach(
            ([key, value]) => {
              rawRequestHeaders[key.toLowerCase()] = value;
            },
          );
        }
      };

      // Collect from a Request object's headers too (not URL, not string)
      if (typeof input === 'object' && !(input instanceof URL) && 'headers' in input) {
        collectHeaders((input as Request).headers as HeadersInit_);
      }
      collectHeaders(init?.headers as HeadersInit_ | undefined);

      const requestHeaders = redactHeaders(
        rawRequestHeaders,
        interceptor.config.redactHeaders,
      );

      // Capture request body
      let requestBody: string | undefined;
      if (init?.body != null) {
        if (typeof init.body === 'string') {
          requestBody = truncateBody(init.body);
        } else {
          requestBody = '[non-string body]';
        }
      }

      interceptor.storage.addNetworkRequest({
        id,
        method,
        url,
        requestHeaders,
        responseHeaders: {},
        requestBody,
        timestamp: startTime,
        state: 'pending',
      });

      try {
        const response = await originalFetch(input, init);
        const duration = Date.now() - startTime;

        // Clone to read body without consuming the original stream
        const cloned = response.clone();
        const rawResponseHeaders: Record<string, string> = {};
        cloned.headers.forEach((value: string, key: string) => {
          rawResponseHeaders[key.toLowerCase()] = value;
        });
        const responseHeaders = redactHeaders(
          rawResponseHeaders,
          interceptor.config.redactHeaders,
        );

        let responseBody: string | undefined;
        try {
          const text = await cloned.text();
          responseBody = truncateBody(text);
        } catch {
          responseBody = '[unreadable body]';
        }

        interceptor.storage.updateNetworkRequest(id, {
          status: response.status,
          statusText: response.statusText,
          responseHeaders,
          responseBody,
          duration,
          state: response.status >= 400 ? 'error' : 'complete',
        });

        return response;
      } catch (err: unknown) {
        const duration = Date.now() - startTime;
        const errorMessage =
          err instanceof Error ? err.message : 'Network request failed';
        const errorStack = err instanceof Error ? err.stack : undefined;

        interceptor.storage.updateNetworkRequest(id, {
          duration,
          state: 'error',
          error: {
            message: errorMessage,
            stack: errorStack,
          },
        });

        throw err;
      }
    };
  }
}
