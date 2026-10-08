import { NetworkRequest } from '../types/NetworkTypes';
import { LogEntry } from '../types/LogTypes';
import { AppEvent } from '../types/EventTypes';
import { AppError } from '../types/ErrorTypes';
import { AppLensStorage } from './AppLensStorage';

/**
 * Ring-buffer backed in-memory storage for AppLens.
 *
 * Each of the three data stores (network, logs, events) has a configurable
 * maximum size. When the buffer is full, the oldest item is evicted before
 * the new one is appended — keeping memory usage bounded.
 *
 * All mutations notify registered subscribers synchronously.
 */
export class MemoryStorage implements AppLensStorage {
  private readonly networkRequests: NetworkRequest[] = [];
  private readonly logs: LogEntry[] = [];
  private readonly events: AppEvent[] = [];
  private readonly errors: AppError[] = [];

  private readonly maxNetworkEntries: number;
  private readonly maxLogEntries: number;
  private readonly maxEventEntries: number;
  private readonly maxErrorEntries: number;

  private readonly listeners: Set<() => void> = new Set();

  constructor(
    maxNetworkEntries: number = 500,
    maxLogEntries: number = 1000,
    maxEventEntries: number = 500,
    maxErrorEntries: number = 200,
  ) {
    this.maxNetworkEntries = maxNetworkEntries;
    this.maxLogEntries = maxLogEntries;
    this.maxEventEntries = maxEventEntries;
    this.maxErrorEntries = maxErrorEntries;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Append an item to an array, evicting the oldest entry if the array
   * has reached its maximum capacity.
   */
  private pushRingBuffer<T>(buffer: T[], item: T, maxSize: number): void {
    if (buffer.length >= maxSize) {
      buffer.shift(); // remove oldest
    }
    buffer.push(item);
  }

  /** Notify all subscribers of a storage change. */
  private notify(): void {
    this.listeners.forEach(listener => listener());
  }

  // ─── Network ──────────────────────────────────────────────────────────────

  addNetworkRequest(request: NetworkRequest): void {
    this.pushRingBuffer(this.networkRequests, request, this.maxNetworkEntries);
    this.notify();
  }

  updateNetworkRequest(id: string, updates: Partial<NetworkRequest>): void {
    const index = this.networkRequests.findIndex(r => r.id === id);
    if (index !== -1) {
      this.networkRequests[index] = {
        ...this.networkRequests[index],
        ...updates,
      } as NetworkRequest;
      this.notify();
    }
  }

  getNetworkRequests(): NetworkRequest[] {
    return [...this.networkRequests];
  }

  clearNetworkRequests(): void {
    this.networkRequests.length = 0;
    this.notify();
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  addLog(entry: LogEntry): void {
    this.pushRingBuffer(this.logs, entry, this.maxLogEntries);
    this.notify();
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs.length = 0;
    this.notify();
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  addEvent(event: AppEvent): void {
    this.pushRingBuffer(this.events, event, this.maxEventEntries);
    this.notify();
  }

  getEvents(): AppEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events.length = 0;
    this.notify();
  }

  // ─── Errors ─────────────────────────────────────────────────────────────────

  addError(error: AppError): void {
    this.pushRingBuffer(this.errors, error, this.maxErrorEntries);
    this.notify();
  }

  getErrors(query?: { limit?: number }): AppError[] {
    if (query?.limit != null) {
      return this.errors.slice(-query.limit);
    }
    return [...this.errors];
  }

  clearErrors(): void {
    this.errors.length = 0;
    this.notify();
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
