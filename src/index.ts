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
export type { AppError } from './types/ErrorTypes';
export type { AIMessage, AIConversation, ContextChunk, AIUsage } from './types/AITypes';

// ─── Storage ──────────────────────────────────────────────────────────────
export type { AppLensStorage } from './storage/AppLensStorage';

// ─── Utils ────────────────────────────────────────────────────────────────
export { redactHeaders, redactFields } from './utils/redact';

// ─── Components ───────────────────────────────────────────────────────────
export { AppLensModal } from './components/AppLensModal';
export { AppLensTrigger } from './components/AppLensTrigger';
export { GraphTab } from './tabs/GraphTab';

// ─── AI ───────────────────────────────────────────────────────────────────
export type { AIProvider } from './ai/AIProvider';
export { createAIProvider } from './ai/AIProvider';
export { OpenAIProvider } from './ai/OpenAIProvider';
export { LocalAIProvider } from './ai/LocalAIProvider';
export { KnowledgeGraph } from './ai/KnowledgeGraph';
export type { GraphNode, NodeType } from './ai/KnowledgeGraph';
export { ContextEngine } from './ai/ContextEngine';

// ─── Agent Mode (device client + shared protocol TYPES only) ────────────────
// Only the RN-safe AgentClient and the shared protocol message TYPES are
// re-exported. Nothing else from src/agent/** (Node-only) is exposed here, so
// the RN bundle never pulls in `ws` or any node:* module.
export { AgentClient } from './agent-client/AgentClient';
export type { AskHandlers, AskResult } from './agent-client/AgentClient';
export type {
  DeviceToolName,
  AskMessage,
  TokenMessage,
  PatchMessage,
  AnswerMessage,
  ErrorMessage,
  ToolCallMessage,
  ToolResultMessage,
  DeviceToAgentMessage,
  AgentToDeviceMessage,
  AgentMessage,
  NetworkLogSummary,
  ConsoleLogSummary,
  PairRequest,
  PairResponse,
} from './agent/protocol';
