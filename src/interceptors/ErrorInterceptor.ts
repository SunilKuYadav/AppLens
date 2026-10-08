import { AppError } from '../types/ErrorTypes';
import { AppLensStorage } from '../storage/AppLensStorage';

/** Generate a simple unique ID without external deps. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Minimal local ambient types (no new deps) ──────────────────────────────

/** React Native's global error handler registry. */
type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
}

type RejectionTracker = (
  options: {
    allRejections: boolean;
    onUnhandled?: (id: number, rejection: unknown) => void;
    onHandled?: (id: number) => void;
  } | null,
) => void;

interface HermesInternalLike {
  enablePromiseRejectionTracker?: RejectionTracker;
}

function getErrorUtils(): ErrorUtilsLike | undefined {
  return (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike })
    .ErrorUtils;
}

function getHermesInternal(): HermesInternalLike | undefined {
  return (globalThis as typeof globalThis & { HermesInternal?: HermesInternalLike })
    .HermesInternal;
}

/**
 * Observes uncaught JavaScript errors and (where available) unhandled promise
 * rejections, storing them in AppLensStorage.
 *
 * The interceptor PRESERVES React Native's existing global error handler by
 * calling it after capturing — it observes rather than replaces the app's
 * error system.
 *
 * attach() is safe to call multiple times; a second call is a no-op.
 */
export class ErrorInterceptor {
  private storage: AppLensStorage;
  private attached: boolean = false;
  private savedHandler: GlobalErrorHandler | null = null;
  private rejectionTrackingEnabled: boolean = false;

  constructor(storage: AppLensStorage) {
    this.storage = storage;
  }

  /** Attach the global error + rejection handlers. Safe to call multiple times. */
  attach(): void {
    if (this.attached) {
      return;
    }

    const errorUtils = getErrorUtils();
    if (errorUtils?.getGlobalHandler && errorUtils.setGlobalHandler) {
      this.savedHandler = errorUtils.getGlobalHandler();
      const saved = this.savedHandler;
      errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        this.storage.addError({
          id: generateId(),
          message: error?.message ?? String(error),
          stack: error?.stack,
          timestamp: Date.now(),
          isFatal: !!isFatal,
        });
        saved?.(error, isFatal);
      });
    }

    // Hermes-only: track unhandled promise rejections as non-fatal errors.
    const hermes = getHermesInternal();
    if (typeof hermes?.enablePromiseRejectionTracker === 'function') {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (_id: number, rejection: unknown) => {
          const err =
            rejection instanceof Error ? rejection : undefined;
          this.storage.addError({
            id: generateId(),
            message: err?.message ?? String(rejection),
            stack: err?.stack,
            timestamp: Date.now(),
            isFatal: false,
          });
        },
      });
      this.rejectionTrackingEnabled = true;
    }

    this.attached = true;
  }

  /** Restore the saved handler and disable rejection tracking. */
  detach(): void {
    if (!this.attached) {
      return;
    }

    const errorUtils = getErrorUtils();
    if (this.savedHandler && errorUtils?.setGlobalHandler) {
      errorUtils.setGlobalHandler(this.savedHandler);
    }
    this.savedHandler = null;

    if (this.rejectionTrackingEnabled) {
      const hermes = getHermesInternal();
      // Passing null disables the tracker where supported.
      hermes?.enablePromiseRejectionTracker?.(null);
      this.rejectionTrackingEnabled = false;
    }

    this.attached = false;
  }
}
