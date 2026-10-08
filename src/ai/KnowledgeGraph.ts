/**
 * In-memory graph representation of the application's source structure.
 *
 * IMPORTANT: KnowledgeGraph does NOT read files at React Native runtime.
 * Source files are parsed by the separate CodeIndexer Node.js script (see
 * CodeIndexer.ts) which produces a GraphNode[] manifest. That manifest is
 * passed into KnowledgeGraph.buildFromManifest() at startup.
 */

export type NodeType =
  | 'screen'
  | 'component'
  | 'hook'
  | 'service'
  | 'store'
  | 'api';

/**
 * A single node in the application knowledge graph.
 */
export interface GraphNode {
  /** Display name of the entity (e.g. 'CheckoutScreen', 'useCheckout') */
  name: string;
  /** What kind of entity this is */
  type: NodeType;
  /** Relative or absolute path to the source file */
  file: string;
  /** Names of other GraphNodes this node imports or depends on */
  dependencies: string[];
}

/**
 * In-memory knowledge graph of the application's component / hook / service
 * relationships.
 *
 * Data is loaded via buildFromManifest() — there is no runtime file-system
 * access in this class.
 */
export class KnowledgeGraph {
  private nodes: GraphNode[] = [];

  // ─── Mutation ────────────────────────────────────────────────────────────

  /** Add a single node to the graph. */
  addNode(node: GraphNode): void {
    this.nodes.push(node);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /** Return all nodes. */
  getNodes(): GraphNode[] {
    return [...this.nodes];
  }

  /** Find a node by exact name (case-sensitive). */
  findByName(name: string): GraphNode | undefined {
    return this.nodes.find((n) => n.name === name);
  }

  /**
   * Return nodes that the named node directly depends on.
   * (i.e. nodes whose name appears in the target node's dependencies array)
   */
  findDependencies(name: string): GraphNode[] {
    const target = this.findByName(name);
    if (!target) {
      return [];
    }
    return target.dependencies
      .map((depName) => this.findByName(depName))
      .filter((n): n is GraphNode => n !== undefined);
  }

  /**
   * Return nodes that depend on the named node.
   * (i.e. nodes that list the target name in their own dependencies)
   */
  findDependents(name: string): GraphNode[] {
    return this.nodes.filter((n) => n.dependencies.includes(name));
  }

  /**
   * Produce a human-readable text summary of all nodes and their
   * relationships, suitable for inclusion in an AI prompt.
   */
  toSummary(): string {
    if (this.nodes.length === 0) {
      return 'Application knowledge graph is empty (no manifest loaded).';
    }

    const lines: string[] = ['Application Knowledge Graph:', ''];

    // Group nodes by type for readability
    const byType = new Map<NodeType, GraphNode[]>();
    for (const node of this.nodes) {
      const group = byType.get(node.type) ?? [];
      group.push(node);
      byType.set(node.type, group);
    }

    const typeOrder: NodeType[] = [
      'screen',
      'component',
      'hook',
      'service',
      'store',
      'api',
    ];

    for (const type of typeOrder) {
      const group = byType.get(type);
      if (!group || group.length === 0) {
        continue;
      }

      lines.push(`${type.toUpperCase()}S:`);
      for (const node of group) {
        lines.push(`  ${node.name} (${node.file})`);
        if (node.dependencies.length > 0) {
          lines.push(`    → uses: ${node.dependencies.join(', ')}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  // ─── Serialisation ───────────────────────────────────────────────────────

  /** Serialise the graph to a plain JSON-compatible object. */
  toJSON(): { nodes: GraphNode[] } {
    return { nodes: [...this.nodes] };
  }

  /** Restore a graph from a previously serialised object. */
  static fromJSON(data: { nodes: GraphNode[] }): KnowledgeGraph {
    const graph = new KnowledgeGraph();
    for (const node of data.nodes) {
      graph.addNode(node);
    }
    return graph;
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  /**
   * Create a KnowledgeGraph pre-populated from a manifest produced by
   * the CodeIndexer Node.js script.
   *
   * Example usage (in your app's entry point):
   * ```ts
   * import manifest from './applens-manifest.json';
   * const graph = KnowledgeGraph.buildFromManifest(manifest);
   * ```
   */
  static buildFromManifest(manifest: GraphNode[]): KnowledgeGraph {
    const graph = new KnowledgeGraph();
    for (const node of manifest) {
      graph.addNode(node);
    }
    return graph;
  }
}
