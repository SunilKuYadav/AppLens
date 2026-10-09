import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { AppLens } from '../core/AppLens';
import { AIMessage } from '../types/AITypes';
import { AIProvider, createAIProvider } from '../ai/AIProvider';
import { ContextEngine } from '../ai/ContextEngine';
import { Badge } from '../components/Badge';

// ─── Confidence parsing ────────────────────────────────────────────────────

type ConfidenceLevel = 'High' | 'Medium' | 'Low';

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  High: '#16a34a',
  Medium: '#d97706',
  Low: '#555',
};

function parseConfidence(content: string): ConfidenceLevel | null {
  const match = /Confidence:\s*(High|Medium|Low)/i.exec(content);
  if (!match) {
    return null;
  }
  const level = match[1].toLowerCase();
  if (level === 'high') return 'High';
  if (level === 'medium') return 'Medium';
  return 'Low';
}

/** Copy text to the clipboard with a safe no-op fallback. */
function copyToClipboard(text: string): void {
  try {
    Clipboard.setString(text);
  } catch {
    // no-op: Clipboard unavailable in this environment
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: AIMessage;
  contextSummary?: string;
}

function MessageBubble({ message, contextSummary }: BubbleProps): React.JSX.Element {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [contextExpanded, setContextExpanded] = useState(false);

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
        <Text style={styles.systemTime}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
    );
  }

  const confidence = !isUser ? parseConfidence(message.content) : null;

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {/* Context-used section (assistant only) */}
        {!isUser && contextSummary && (
          <View style={styles.contextSection}>
            <TouchableOpacity
              onPress={() => setContextExpanded((v) => !v)}
              accessibilityRole="button"
              activeOpacity={0.7}
            >
              <Text style={styles.contextToggle}>
                {contextExpanded ? '▾ Context used' : '▸ Context used'}
              </Text>
            </TouchableOpacity>
            {contextExpanded && (
              <Text style={styles.contextBody}>{contextSummary}</Text>
            )}
          </View>
        )}

        {isUser ? (
          <Text style={[styles.bubbleText, styles.userText]}>
            {message.content}
          </Text>
        ) : (
          <Markdown style={markdownStyles}>{message.content}</Markdown>
        )}

        {/* Footer: confidence badge + copy + time */}
        <View style={styles.bubbleFooter}>
          {confidence && (
            <Badge label={`Confidence: ${confidence}`} color={CONFIDENCE_COLORS[confidence]} />
          )}
          {!isUser && (
            <TouchableOpacity
              onPress={() => copyToClipboard(message.content)}
              accessibilityRole="button"
              accessibilityLabel="Copy message"
              activeOpacity={0.7}
            >
              <Text style={styles.copyText}>Copy</Text>
            </TouchableOpacity>
          )}
          <Text
            style={[
              styles.bubbleTime,
              isUser ? styles.userTime : styles.assistantTime,
            ]}
          >
            {formatTimestamp(message.timestamp)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Setup prompt (when no API key configured) ────────────────────────────────

function SetupPrompt(): React.JSX.Element {
  return (
    <View style={styles.setupContainer}>
      <Text style={styles.setupEmoji}>🤖</Text>
      <Text style={styles.setupTitle}>Configure AppLens AI</Text>
      <Text style={styles.setupBody}>
        AppLens AI needs an AI provider to function.
      </Text>

      <Text style={styles.setupSectionLabel}>Option 1 — LM Studio (local)</Text>
      <View style={styles.codeBlock}>
        <Text style={styles.codeText}>
          {"AppLens.initialize({\n  ai: true,\n  aiProvider: 'lmstudio',\n  // optional — defaults to http://127.0.0.1:1234/v1\n  aiBaseURL: 'http://127.0.0.1:1234/v1',\n});"}
        </Text>
      </View>
      <Text style={styles.setupBody}>
        Android emulator: use http://10.0.2.2:1234/v1 • iOS simulator: 127.0.0.1 works • Physical device: use your computer's LAN IP
      </Text>

      <Text style={styles.setupSectionLabel}>Option 2 — OpenAI</Text>
      <View style={styles.codeBlock}>
        <Text style={styles.codeText}>
          {"AppLens.initialize({\n  ai: true,\n  aiProvider: 'openai',\n  aiApiKey: 'sk-...',\n});"}
        </Text>
      </View>

      <Text style={styles.setupBody}>
        Once configured, ask about your app's architecture, debug failures, trace data flows, and more.
      </Text>
    </View>
  );
}

// ─── AITab ────────────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: AIMessage = {
  id: 'system-welcome',
  role: 'system',
  content:
    'AppLens AI is ready. I have access to your network logs, console output, ' +
    'events, and app structure. Ask me anything.',
  timestamp: Date.now(),
};

export function AITab(): React.JSX.Element {
  const config = AppLens.getConfig();

  // Re-create the provider whenever the AI-related config fields change.
  // Using a ref keyed to a config fingerprint avoids unnecessary recreation
  // while still picking up changes from initialize() or Settings toggles.
  const configKey = `${config.aiProvider}|${config.aiApiKey ?? ''}|${config.aiBaseURL ?? ''}|${config.aiModel ?? ''}`;
  const providerRef = useRef<{ key: string; provider: AIProvider } | null>(null);
  const contextEngineRef = useRef<ContextEngine | null>(null);

  if (providerRef.current === null || providerRef.current.key !== configKey) {
    providerRef.current = { key: configKey, provider: createAIProvider(config) };
  }
  if (contextEngineRef.current === null) {
    contextEngineRef.current = new ContextEngine(AppLens.getStorage(), AppLens.getKnowledgeGraph());
  }

  const provider = providerRef.current.provider;
  const contextEngine = contextEngineRef.current;

  const [messages, setMessages] = useState<AIMessage[]>([WELCOME_MESSAGE]);
  const [contextSummaries, setContextSummaries] = useState<Record<string, string>>({});
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  const flatListRef = useRef<FlatList<AIMessage>>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || loading) {
      return;
    }

    const userMessage: AIMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      // Retrieve relevant context chunks for this question
      const contextChunks = contextEngine.getRelevantContext(text);
      const summary = contextEngine.getContextSummary(text);

      // Get the full conversation (excluding the system welcome)
      const conversationHistory = [...messages, userMessage].filter(
        (m) => m.role !== 'system',
      );

      const reply = await provider.chat(conversationHistory, contextChunks);

      const assistantMessage: AIMessage = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };

      setContextSummaries((prev) => ({ ...prev, [assistantMessage.id]: summary }));
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errorText =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.';

      const errorMessage: AIMessage = {
        id: generateId(),
        role: 'assistant',
        content: `⚠️ ${errorText}`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, messages, provider, contextEngine]);

  // Show setup prompt when AI is not configured
  if (!provider.isConfigured()) {
    return (
      <View style={styles.container}>
        <SetupPrompt />
      </View>
    );
  }

  const graphEmpty = AppLens.getKnowledgeGraph().getNodes().length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      {/* Empty-graph hint (configured chat path only) */}
      {graphEmpty && (
        <View style={styles.graphHint}>
          <Text style={styles.graphHintLead}>
            Add a code graph for architecture questions
          </Text>
          <Text style={styles.graphHintSub}>
            Run npx applens-index ./src &gt; app-graph.json, then AppLens.loadKnowledgeGraph(require(./app-graph.json)) at startup.
          </Text>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} contextSummary={contextSummaries[item.id]} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#00ff88" />
          <Text style={styles.loadingText}>AppLens AI is thinking…</Text>
        </View>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your app…"
          placeholderTextColor="#555"
          multiline
          maxLength={2000}
          editable={!loading}
          returnKeyType="default"
          onSubmitEditing={Platform.OS === 'ios' ? handleSend : undefined}
        />
        <Pressable
          style={[styles.sendButton, (loading || !inputText.trim()) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={loading || !inputText.trim()}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <Text style={styles.sendButtonText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Markdown styles (for assistant bubbles) ──────────────────────────────────

const markdownStyles = {
  body: {
    color: '#e8e8e8',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 6,
    color: '#e8e8e8',
  },
  heading1: { color: '#00ff88', fontSize: 18, fontWeight: '700' as const, marginBottom: 6 },
  heading2: { color: '#00ff88', fontSize: 16, fontWeight: '700' as const, marginBottom: 4 },
  heading3: { color: '#00ff88', fontSize: 14, fontWeight: '700' as const, marginBottom: 4 },
  strong: { color: '#ffffff', fontWeight: '700' as const },
  em: { color: '#aaaaaa', fontStyle: 'italic' as const },
  code_inline: {
    backgroundColor: '#0d0d0d',
    color: '#00ff88',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fence: {
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  code_block: {
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    color: '#00ff88',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: '#e8e8e8', marginBottom: 2 },
  bullet_list_icon: { color: '#00ff88' },
  ordered_list_icon: { color: '#00ff88' },
  blockquote: {
    backgroundColor: '#1a1a1a',
    borderLeftWidth: 3,
    borderLeftColor: '#00ff88',
    paddingLeft: 10,
    marginVertical: 6,
    opacity: 0.85,
  },
  hr: { borderColor: '#2a2a2a', marginVertical: 8 },
  link: { color: '#00ff88', textDecorationLine: 'underline' as const },
  table: { borderColor: '#2a2a2a', marginVertical: 6 },
  th: { backgroundColor: '#1a1a1a', color: '#00ff88', fontWeight: '700' as const },
  td: { color: '#e8e8e8' },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },

  // ── Empty-graph hint ──
  graphHint: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    margin: 8,
    padding: 10,
  },
  graphHintLead: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: '600',
  },
  graphHintSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },

  // ── List ──
  listContent: {
    padding: 12,
    paddingBottom: 8,
  },

  // ── System message ──
  systemRow: {
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  systemText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  systemTime: {
    color: '#555',
    fontSize: 10,
    marginTop: 4,
  },

  // ── Bubble rows ──
  bubbleRow: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },

  // ── Bubbles ──
  bubble: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  userBubble: {
    backgroundColor: '#006940',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#e8e8e8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
  },
  userTime: {
    color: '#80c9a0',
    textAlign: 'right',
  },
  assistantTime: {
    color: '#555',
  },

  // ── Context used ──
  contextSection: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  contextToggle: {
    color: '#00ff88',
    fontSize: 11,
    fontWeight: '600',
  },
  contextBody: {
    color: '#888',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ── Footer ──
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  copyText: {
    color: '#00ff88',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Loading ──
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  loadingText: {
    color: '#555',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // ── Input row ──
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#111',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#1a3a2a',
  },
  sendButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Setup prompt ──
  setupContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  setupEmoji: {
    fontSize: 48,
  },
  setupTitle: {
    color: '#00ff88',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  setupBody: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  setupSectionLabel: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  codeBlock: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  codeText: {
    color: '#00ff88',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
});
