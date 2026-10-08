import { LogEntry, LogLevel } from '../types/LogTypes';
import { AppLensStorage } from '../storage/AppLensStorage';

/** Generate a simple unique ID without external deps. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Trim the AppLens interceptor frames from a stack trace so the developer
 * sees their own code rather than AppLens internals.
 */
function cleanStack(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }
  const lines = stack.split('\n');
  // Keep the header line and drop frames that belong to this file
  const filtered = lines.filter(
    line => !line.includes('ConsoleInterceptor'),
  );
  return filtered.join('\n').trim() || undefined;
}

type ConsoleFn = (...args: unknown[]) => void;

/**
 * Wraps the global console object to capture log output into AppLensStorage
 * while still forwarding every call to the original implementation so the
 * native dev console continues to work as expected.
 *
 * attach() is safe to call multiple times — a second call is a no-op.
 * detach() restores every console method to its original implementation.
 */
export class ConsoleInterceptor {
  private storage: AppLensStorage;
  private attached: boolean = false;

  private originalLog: ConsoleFn | null = null;
  private originalInfo: ConsoleFn | null = null;
  private originalWarn: ConsoleFn | null = null;
  private originalError: ConsoleFn | null = null;
  private originalDebug: ConsoleFn | null = null;

  constructor(storage: AppLensStorage) {
    this.storage = storage;
  }

  /** Attach console interceptors. Safe to call multiple times. */
  attach(): void {
    if (this.attached) {
      return;
    }

    this.originalLog = console.log.bind(console);
    this.originalInfo = console.info.bind(console);
    this.originalWarn = console.warn.bind(console);
    this.originalError = console.error.bind(console);
    this.originalDebug = console.debug.bind(console);

    console.log = this.createWrapper('log', this.originalLog);
    console.info = this.createWrapper('info', this.originalInfo);
    console.warn = this.createWrapper('warn', this.originalWarn);
    console.error = this.createWrapper('error', this.originalError);
    console.debug = this.createWrapper('debug', this.originalDebug);

    this.attached = true;
  }

  /** Restore original console methods. */
  detach(): void {
    if (!this.attached) {
      return;
    }

    if (this.originalLog) {
      console.log = this.originalLog;
    }
    if (this.originalInfo) {
      console.info = this.originalInfo;
    }
    if (this.originalWarn) {
      console.warn = this.originalWarn;
    }
    if (this.originalError) {
      console.error = this.originalError;
    }
    if (this.originalDebug) {
      console.debug = this.originalDebug;
    }

    this.originalLog = null;
    this.originalInfo = null;
    this.originalWarn = null;
    this.originalError = null;
    this.originalDebug = null;

    this.attached = false;
  }

  /** Create a replacement console function for the given level. */
  private createWrapper(level: LogLevel, original: ConsoleFn): ConsoleFn {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const interceptor = this;

    return function (...args: unknown[]): void {
      // Forward to the original console first so dev tools still work
      original(...args);

      // Capture a stack trace at the call site
      const stack = cleanStack(new Error().stack);

      const entry: LogEntry = {
        id: generateId(),
        level,
        message: args.length > 0 ? String(args[0]) : '',
        args,
        timestamp: Date.now(),
        stack,
      };

      interceptor.storage.addLog(entry);
    };
  }
}
