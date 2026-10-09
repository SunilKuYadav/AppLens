import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppLens } from '../core/AppLens';
import { GraphNode, NodeType } from '../ai/KnowledgeGraph';

const TYPE_ORDER: NodeType[] = ['screen', 'component', 'hook', 'service', 'store', 'api'];

// ─── Empty state (mirrors AITab's SetupPrompt visual language) ──────────────

function EmptyGraph(): React.JSX.Element {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.setupContainer}>
      <Text style={styles.setupTitle}>No knowledge graph loaded</Text>
      <Text style={styles.setupBody}>
        The knowledge graph is a map of your app's screens, components, hooks,
        services, stores and APIs and how they depend on each other. AppLens AI
        uses it to answer questions about your architecture, and this tab previews
        it.
      </Text>

      <Text style={styles.setupSectionLabel}>Generate it from your app's source</Text>
      <View style={styles.codeBlock}>
        <Text style={styles.codeText}>{'npx applens-index ./src > app-graph.json'}</Text>
      </View>

      <Text style={styles.setupSectionLabel}>Load it at startup</Text>
      <View style={styles.codeBlock}>
        <Text style={styles.codeText}>
          {"import graph from './app-graph.json';\nAppLens.loadKnowledgeGraph(graph);"}
        </Text>
      </View>

      <Text style={styles.setupFooter}>
        Point applens-index at your own app's source (e.g. ./src), not at AppLens.
      </Text>
    </ScrollView>
  );
}

// ─── Non-empty structured list ──────────────────────────────────────────────

function NodeRow({ node }: { node: GraphNode }): React.JSX.Element {
  return (
    <View style={styles.nodeRow}>
      <Text style={styles.nodeName}>{node.name}</Text>
      <Text style={styles.nodeFile}>{node.file}</Text>
      {node.dependencies.length > 0 && (
        <Text style={styles.nodeDeps}>{'uses: ' + node.dependencies.join(', ')}</Text>
      )}
    </View>
  );
}

export function GraphTab(): React.JSX.Element {
  const graph = AppLens.getKnowledgeGraph();
  const nodes = graph.getNodes();

  if (nodes.length === 0) {
    return <EmptyGraph />;
  }

  // Group nodes by type in the fixed order
  const byType = new Map<NodeType, GraphNode[]>();
  for (const node of nodes) {
    const group = byType.get(node.type) ?? [];
    group.push(node);
    byType.set(node.type, group);
  }

  const orderedTypes = TYPE_ORDER.filter((type) => (byType.get(type)?.length ?? 0) > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary header card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTotal}>{nodes.length} nodes</Text>
        <View style={styles.summaryBreakdown}>
          {orderedTypes.map((type) => (
            <Text key={type} style={styles.summaryCount}>
              {`${byType.get(type)!.length} ${type}`}
            </Text>
          ))}
        </View>
      </View>

      {/* Grouped-by-type sections */}
      {orderedTypes.map((type) => (
        <View key={type}>
          <Text style={styles.sectionHeader}>{type}</Text>
          <View style={styles.card}>
            {byType.get(type)!.map((node) => (
              <NodeRow key={`${type}-${node.name}-${node.file}`} node={node} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    padding: 12,
  },

  // ── Summary header ──
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  summaryTotal: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  summaryCount: {
    color: '#888',
    fontSize: 12,
  },

  // ── Section header ──
  sectionHeader: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },

  // ── Node cards ──
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  nodeRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  nodeName: {
    color: '#e8e8e8',
    fontSize: 14,
    fontWeight: '600',
  },
  nodeFile: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  nodeDeps: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },

  // ── Empty state ──
  setupContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
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
  setupFooter: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
});
