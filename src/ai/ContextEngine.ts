import { ContextChunk } from '../types/AITypes';
import { AppLensStorage } from '../storage/AppLensStorage';
import { KnowledgeGraph } from './KnowledgeGraph';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stop-words to strip before keyword extraction. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'of', 'to', 'for',
  'and', 'or', 'not', 'but', 'with', 'this', 'that', 'was', 'are',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'from',
  'at', 'by', 'up', 'about', 'into', 'through', 'during', 'my', 'me',
  'we', 'i', 'why', 'what', 'how', 'where', 'when', 'which', 'who',
  'show', 'get', 'set', 'went', 'going', 'go', 'its',
]);

/** Keywords that trigger inclusion of the knowledge graph summary. */
const GRAPH_KEYWORDS = new Set([
  'component', 'hook', 'service', 'flow', 'architecture', 'how',
  'screen', 'store', 'api', 'data', 'navigation', 'relationship',
  'structure', 'where', 'which', 'uses', 'calls', 'imports',
]);

/** Approximate character-to-token ratio for rough token budget estimation. */
const CHARS_PER_TOKEN = 4;

/** Maximum total characters to include across all context chunks (~8000 tokens). */
const MAX_TOTAL_CHARS = 8000 * CHARS_PER_TOKEN;

/** Maximum body/message length for a single network or log chunk. */
const MAX_CHUNK_BODY_CHARS = 2000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + `… [truncated ${text.length - maxChars} chars]`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

// ─── ContextEngine ────────────────────────────────────────────────────────────

/**
 * Retrieves the most relevant runtime and structural context for a given
 * developer question.
 *
 * The engine uses simple keyword matching to select context chunks from:
 * - Network request logs (filtered by URL keywords)
 * - Console log entries (filtered by message keywords)
 * - Application events (filtered by name / properties keywords)
 * - Knowledge graph summary (included when architecture-related keywords appear)
 *
 * All results are sorted by relevanceScore descending, and the total
 * context is kept under ~8000 tokens by truncating individual chunk bodies.
 */
export class ContextEngine {
  private readonly storage: AppLensStorage;
  private readonly graph: KnowledgeGraph;

  constructor(storage: AppLensStorage, graph: KnowledgeGraph) {
    this.storage = storage;
    this.graph = graph;
  }

  /**
   * Return an array of ContextChunks relevant to the developer's question.
   * Chunks are sorted by relevanceScore descending.
   */
  getRelevantContext(question: string): ContextChunk[] {
    const keywords = extractKeywords(question);
    const chunks: ContextChunk[] = [];

    // 1. Network requests
    chunks.push(...this.buildNetworkChunks(keywords));

    // 2. Console logs
    chunks.push(...this.buildLogChunks(keywords));

    // 3. Events
    chunks.push(...this.buildEventChunks(keywords));

    // 4. Knowledge graph
    const graphChunk = this.buildGraphChunk(question, keywords);
    if (graphChunk) {
      chunks.push(graphChunk);
    }

    // Sort by relevance descending
    chunks.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Enforce total token budget
    return this.applyTokenBudget(chunks);
  }

  // ─── Private builders ───────────────────────────────────────────────────

  private buildNetworkChunks(keywords: string[]): ContextChunk[] {
    const allRequests = this.storage.getNetworkRequests();

    // Most recent first; filter by URL keyword match
    const matched = allRequests
      .slice()
      .reverse()
      .filter((req) => keywords.length === 0 || containsAny(req.url, keywords));

    // Take top 5
    const top = matched.slice(0, 5);

    return top.map((req) => {
      const status = req.status ?? req.state.toUpperCase();
      const duration = req.duration != null ? `${req.duration}ms` : 'pending';
      const ts = formatTimestamp(req.timestamp);

      let content = `${req.method} ${req.url}\nStatus: ${status}  Duration: ${duration}  Time: ${ts}`;

      if (req.requestBody) {
        content += `\nRequest Body: ${truncate(req.requestBody, MAX_CHUNK_BODY_CHARS)}`;
      }
      if (req.responseBody) {
        content += `\nResponse: ${truncate(req.responseBody, MAX_CHUNK_BODY_CHARS)}`;
      }
      if (req.error) {
        content += `\nError: ${req.error.message}`;
      }

      // Requests with errors get a higher relevance score
      const score = req.state === 'error' ? 0.9 : 0.7;

      return { type: 'network' as const, content, relevanceScore: score };
    });
  }

  private buildLogChunks(keywords: string[]): ContextChunk[] {
    const allLogs = this.storage.getLogs();

    const matched = allLogs
      .slice()
      .reverse()
      .filter(
        (entry) =>
          keywords.length === 0 || containsAny(entry.message, keywords),
      );

    const top = matched.slice(0, 10);

    return top.map((entry) => {
      const ts = formatTimestamp(entry.timestamp);
      const content = `${entry.level.toUpperCase()} ${ts}: ${truncate(entry.message, MAX_CHUNK_BODY_CHARS)}`;

      // Error and warn logs get higher scores
      const score =
        entry.level === 'error' ? 0.85 :
        entry.level === 'warn'  ? 0.75 :
        0.6;

      return { type: 'log' as const, content, relevanceScore: score };
    });
  }

  private buildEventChunks(keywords: string[]): ContextChunk[] {
    const allEvents = this.storage.getEvents();

    const matched = allEvents
      .slice()
      .reverse()
      .filter((evt) => {
        if (keywords.length === 0) {
          return true;
        }
        const propertiesStr = evt.properties
          ? JSON.stringify(evt.properties)
          : '';
        return containsAny(evt.name + ' ' + propertiesStr, keywords);
      });

    const top = matched.slice(0, 5);

    return top.map((evt) => {
      const ts = formatTimestamp(evt.timestamp);
      const propsStr = evt.properties
        ? truncate(JSON.stringify(evt.properties, null, 2), MAX_CHUNK_BODY_CHARS)
        : '{}';
      const content = `Event: ${evt.name}  Time: ${ts}\nProperties: ${propsStr}`;

      return { type: 'event' as const, content, relevanceScore: 0.65 };
    });
  }

  private buildGraphChunk(
    question: string,
    keywords: string[],
  ): ContextChunk | null {
    const lowerQuestion = question.toLowerCase();
    const hasGraphKeyword =
      keywords.some((kw) => GRAPH_KEYWORDS.has(kw)) ||
      [...GRAPH_KEYWORDS].some((gk) => lowerQuestion.includes(gk));

    if (!hasGraphKeyword) {
      return null;
    }

    const summary = this.graph.toSummary();
    if (summary.includes('empty')) {
      return null;
    }

    return {
      type: 'graph' as const,
      content: truncate(summary, MAX_CHUNK_BODY_CHARS * 4),
      relevanceScore: 0.8,
    };
  }

  // ─── Token budget enforcement ────────────────────────────────────────────

  private applyTokenBudget(chunks: ContextChunk[]): ContextChunk[] {
    let usedChars = 0;
    const result: ContextChunk[] = [];

    for (const chunk of chunks) {
      if (usedChars >= MAX_TOTAL_CHARS) {
        break;
      }
      const remaining = MAX_TOTAL_CHARS - usedChars;
      if (chunk.content.length > remaining) {
        // Truncate to fit within remaining budget
        result.push({
          ...chunk,
          content: truncate(chunk.content, remaining),
        });
        usedChars = MAX_TOTAL_CHARS;
      } else {
        result.push(chunk);
        usedChars += chunk.content.length;
      }
    }

    return result;
  }
}
