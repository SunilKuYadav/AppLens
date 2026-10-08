import { NetworkRequest } from '../types/NetworkTypes';
import { LogEntry } from '../types/LogTypes';
import { AppEvent } from '../types/EventTypes';
import { AppError } from '../types/ErrorTypes';

/**
 * Defines the contract for AppLens in-memory data storage.
 * All operations are synchronous. Subscribers are notified on every mutation.
 */
export interface AppLensStorage {
  // ─── Network ──────────────────────────────────────────────────────────────

  /** Add a new network request (typically in 'pending' state). */
  addNetworkRequest(request: NetworkRequest): void;

  /** Update an existing request by id (e.g. fill in status/response after completion). */
  updateNetworkRequest(id: string, updates: Partial<NetworkRequest>): void;

  /** Return all stored network requests, oldest first. */
  getNetworkRequests(): NetworkRequest[];

  /** Remove all stored network requests. */
  clearNetworkRequests(): void;

  // ─── Logs ─────────────────────────────────────────────────────────────────

  /** Add a new console log entry. */
  addLog(entry: LogEntry): void;

  /** Return all stored log entries, oldest first. */
  getLogs(): LogEntry[];

  /** Remove all stored log entries. */
  clearLogs(): void;

  // ─── Events ───────────────────────────────────────────────────────────────

  /** Add a new application event. */
  addEvent(event: AppEvent): void;

  /** Return all stored events, oldest first. */
  getEvents(): AppEvent[];

  /** Remove all stored events. */
  clearEvents(): void;

  // ─── Errors ───────────────────────────────────────────────────────────────

  /** Add a new captured error. */
  addError(error: AppError): void;

  /** Return stored errors, oldest first. When `query.limit` is set, return the most-recent `limit`. */
  getErrors(query?: { limit?: number }): AppError[];

  /** Remove all stored errors. */
  clearErrors(): void;

  // ─── Subscriptions ────────────────────────────────────────────────────────

  /**
   * Subscribe to any storage mutation.
   * Returns an unsubscribe function — call it to stop listening.
   */
  subscribe(listener: () => void): () => void;
}
