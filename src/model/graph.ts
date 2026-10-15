import type { WorkspacePackage } from "../detect/types";

export interface GraphNode {
  id: string;
  dir: string;
  version?: string;
  private?: boolean;
  /** Layer index from a topological sort: 0 = leaf packages with no internal deps. */
  layer: number;
  sources: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Package names involved in a dependency cycle, if any. */
  cycles: string[][];
}

/**
 * Builds a layered dependency graph. Layers are computed with a longest-path
 * topological sort so the webview can draw dependencies left to right without a
 * physics simulation. Cycles are detected and reported rather than crashing.
 */
export function buildGraph(packages: WorkspacePackage[]): DependencyGraph {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const edges: GraphEdge[] = [];
  for (const p of packages) {
    for (const dep of p.workspaceDependencies) {
      if (byName.has(dep)) {
        edges.push({ from: p.name, to: dep });
      }
    }
  }

  const cycles = findCycles(packages);
  const inCycle = new Set(cycles.flat());

  // Longest-path layering, ignoring edges that participate in cycles.
  const layerOf = new Map<string, number>();
  const visiting = new Set<string>();
  const layer = (name: string): number => {
    const cached = layerOf.get(name);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(name)) {
      return 0;
    }
    visiting.add(name);
    const deps = byName.get(name)?.workspaceDependencies ?? [];
    let max = -1;
    for (const d of deps) {
      if (inCycle.has(name) && inCycle.has(d)) {
        continue;
      }
      max = Math.max(max, layer(d));
    }
    visiting.delete(name);
    layerOf.set(name, max + 1);
    return max + 1;
  };

  const nodes: GraphNode[] = packages.map((p) => ({
    id: p.name,
    dir: p.dir,
    version: p.version,
    private: p.private,
    layer: layer(p.name),
    sources: p.sources,
  }));

  return { nodes, edges, cycles };
}

/** Tarjan's SCC; returns components with more than one member (or a self-loop). */
export function findCycles(packages: WorkspacePackage[]): string[][] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of byName.get(v)?.workspaceDependencies ?? []) {
      if (!byName.has(w)) continue;
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) {
        result.push(comp.sort());
      }
    }
  };

  for (const p of packages) {
    if (!idx.has(p.name)) {
      strong(p.name);
    }
  }
  return result;
}

/** Packages that (transitively) depend on `name`. Useful for "what breaks if I change this". */
export function dependentsOf(packages: WorkspacePackage[], name: string): string[] {
  const reverse = new Map<string, string[]>();
  for (const p of packages) {
    for (const d of p.workspaceDependencies) {
      if (!reverse.has(d)) reverse.set(d, []);
      reverse.get(d)!.push(p.name);
    }
  }
  const seen = new Set<string>();
  const queue = [...(reverse.get(name) ?? [])];
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    queue.push(...(reverse.get(n) ?? []));
  }
  return [...seen].sort();
}
