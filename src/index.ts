// ─── Core ─────────────────────────────────────────────────────────────────
export { AppLens } from './core/AppLens';
export { AppLensProvider, useAppLens } from './core/AppLensProvider';
export { AppLensUI } from './core/AppLensUI';

// ─── Config ───────────────────────────────────────────────────────────────
export type { AppLensConfig } from './core/AppLensConfig';

// ─── Types ────────────────────────────────────────────────────────────────
export type { NetworkRequest } from './types/NetworkTypes';
export type { LogEntry, LogLevel } from './types/LogTypes';
export type { AppEvent } from './types/EventTypes';
export type { AIMessage, AIConversation } from './types/AITypes';

// ─── Components ───────────────────────────────────────────────────────────
export { AppLensModal } from './components/AppLensModal';
export { AppLensTrigger } from './components/AppLensTrigger';
