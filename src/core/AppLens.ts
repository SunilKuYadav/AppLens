import { AppLensConfig, DEFAULT_CONFIG } from './AppLensConfig';
import { AppLensStorage } from '../storage/AppLensStorage';
import { MemoryStorage } from '../storage/MemoryStorage';
import { NetworkInterceptor } from '../interceptors/NetworkInterceptor';
import { ConsoleInterceptor } from '../interceptors/ConsoleInterceptor';
import { AppEvent } from '../types/EventTypes';

/** Generate a simple unique ID without external deps. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * AppLens singleton — the single entry point for the entire library.
 *
 * Usage:
 * ```ts
 * AppLens.initialize({ aiApiKey: 'sk-...' });
 * AppLens.trackEvent('checkout_started', { amount: 499 });
 * ```
 *
 * initialize() is idempotent: a second call updates the config but does NOT
 * re-attach interceptors that are already running.
 */
class AppLensClass {
  private config: AppLensConfig = { ...DEFAULT_CONFIG };
  private storage: MemoryStorage = new MemoryStorage(
    DEFAULT_CONFIG.maxNetworkEntries,
    DEFAULT_CONFIG.maxLogEntries,
    DEFAULT_CONFIG.maxEventEntries,
  );
  private networkInterceptor: NetworkInterceptor | null = null;
  private consoleInterceptor: ConsoleInterceptor | null = null;
  private initialized: boolean = false;

  // Private constructor — consumers must use the exported singleton instance.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  // ─── Singleton factory ────────────────────────────────────────────────────

  /** @internal */
  static create(): AppLensClass {
    return new AppLensClass();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Initialize (or re-configure) AppLens.
   *
   * Merges the provided partial config with DEFAULT_CONFIG.
   * On the first call, creates the storage and starts interceptors.
   * On subsequent calls, updates config without re-attaching interceptors.
   */
  initialize(partialConfig: Partial<AppLensConfig> = {}): void {
    const newConfig: AppLensConfig = {
      ...DEFAULT_CONFIG,
      ...partialConfig,
      // Ensure redactHeaders merge doesn't lose defaults when caller
      // only partially overrides the array.
      redactHeaders: partialConfig.redactHeaders ?? DEFAULT_CONFIG.redactHeaders,
    };

    // Recreate storage only on the first call (sized to config).
    if (!this.initialized) {
      this.storage = new MemoryStorage(
        newConfig.maxNetworkEntries,
        newConfig.maxLogEntries,
        newConfig.maxEventEntries,
      );
    }

    this.config = newConfig;

    if (!this.initialized) {
      this.initialized = true;

      if (newConfig.enabled) {
        this.startInterceptors();
      }
    }
    // Second+ calls: config is updated but interceptors are left as-is.
  }

  /** Return the active configuration (read-only copy). */
  getConfig(): AppLensConfig {
    return { ...this.config };
  }

  /** Return the shared storage instance. */
  getStorage(): AppLensStorage {
    return this.storage;
  }

  /**
   * Track a named application event.
   * No-op when AppLens is disabled or events are turned off.
   */
  trackEvent(name: string, properties?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.config.events) {
      return;
    }

    const event: AppEvent = {
      id: generateId(),
      name,
      timestamp: Date.now(),
      properties,
    };

    this.storage.addEvent(event);
  }

  /**
   * Returns true when AppLens is initialized and enabled.
   */
  isEnabled(): boolean {
    return this.initialized && this.config.enabled;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private startInterceptors(): void {
    if (this.config.network) {
      this.networkInterceptor = new NetworkInterceptor(
        this.storage,
        this.config,
      );
      this.networkInterceptor.attach();
    }

    if (this.config.console) {
      this.consoleInterceptor = new ConsoleInterceptor(this.storage);
      this.consoleInterceptor.attach();
    }
  }
}

/**
 * The AppLens singleton instance.
 * Import and use this directly — do not instantiate AppLensClass yourself.
 */
export const AppLens = AppLensClass.create();
