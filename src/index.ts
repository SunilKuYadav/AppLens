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
export type { AIMessage, AIConversation, ContextChunk } from './types/AITypes';

// ─── Components ───────────────────────────────────────────────────────────
export { AppLensModal } from './components/AppLensModal';
export { AppLensTrigger } from './components/AppLensTrigger';

// ─── AI ───────────────────────────────────────────────────────────────────
export type { AIProvider } from './ai/AIProvider';
export { createAIProvider } from './ai/AIProvider';
export { OpenAIProvider } from './ai/OpenAIProvider';
export { LocalAIProvider } from './ai/LocalAIProvider';
export { KnowledgeGraph } from './ai/KnowledgeGraph';
export type { GraphNode, NodeType } from './ai/KnowledgeGraph';
export { ContextEngine } from './ai/ContextEngine';
