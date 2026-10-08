import React, { useState } from 'react';
import {
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { scenarios, Scenario } from '../aiLab/scenarios';

type RunState = 'idle' | 'running' | 'done' | 'error';

/** Copy text to the clipboard with a safe no-op fallback (same approach as AITab). */
function copyToClipboard(text: string): void {
  try {
    Clipboard.setString(text);
  } catch {
    // no-op: Clipboard unavailable in this environment
  }
}

function ScenarioCard({ scenario }: { scenario: Scenario }): React.JSX.Element {
  const [runState, setRunState] = useState<RunState>('idle');
  const [copied, setCopied] = useState(false);

  const handleRun = async () => {
    if (runState === 'running') {
      return;
    }
    setRunState('running');
    try {
      await scenario.run();
      setRunState('done');
    } catch {
      // run() is designed never to throw, but guard anyway.
      setRunState('error');
    }
  };

  const handleCopy = () => {
    copyToClipboard(scenario.suggestedQuestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  let runLabel = 'Run scenario';
  if (runState === 'running') {
    runLabel = 'Running…';
  } else if (runState === 'done') {
    runLabel = 'Run again';
  } else if (runState === 'error') {
    runLabel = 'Retry';
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{scenario.title}</Text>
      <Text style={styles.cardDescription}>{scenario.description}</Text>

      <TouchableOpacity
        style={[styles.runButton, runState === 'running' && styles.runButtonDisabled]}
        onPress={handleRun}
        disabled={runState === 'running'}
        activeOpacity={0.85}>
        <Text style={styles.runButtonText}>{runLabel}</Text>
      </TouchableOpacity>

      {runState === 'done' && (
        <Text style={styles.statusDone}>
          ✓ Evidence generated. Open the AppLens AI tab and ask the question below.
        </Text>
      )}

      <View style={styles.questionRow}>
        <Text selectable style={styles.questionText}>
          {scenario.suggestedQuestion}
        </Text>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={handleCopy}
          activeOpacity={0.85}>
          <Text style={styles.copyButtonText}>
            {copied ? 'Copied' : 'Copy question'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AILabScreen(): React.JSX.Element {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>AI Test Lab</Text>
      <Text style={styles.intro}>
        Each scenario generates real runtime evidence (network, console, events,
        errors) for the AppLens AI to reason about. Run a scenario, tap “Copy
        question”, then open the floating AppLens trigger, go to the AI tab, and
        paste the question.
      </Text>

      {scenarios.map((scenario) => (
        <ScenarioCard key={scenario.id} scenario={scenario} />
      ))}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16 },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  intro: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  runButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  runButtonDisabled: { backgroundColor: '#A5B4FC' },
  runButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  statusDone: {
    fontSize: 12,
    color: '#059669',
    marginTop: 10,
    lineHeight: 18,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  questionText: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    fontStyle: 'italic',
  },
  copyButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyButtonText: { color: '#4F46E5', fontSize: 12, fontWeight: '700' },
  bottomSpacer: { height: 24 },
});
