import type { DependencyGraph } from "./types";

export interface Positioned {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NODE_H = 36;
export const LAYER_GAP = 120;
export const ROW_GAP = 16;
const PAD = 24;

/**
 * Places nodes in columns by topological layer (leaves on the left, apps on the
 * right). Within a column, nodes are ordered by the average row of their
 * dependencies, which reduces edge crossings without a full Sugiyama pass.
 */
export function layout(graph: DependencyGraph, measure: (id: string) => number) {
  const byLayer = new Map<number, string[]>();
  for (const n of graph.nodes) {
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
    byLayer.get(n.layer)!.push(n.id);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const deps = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!deps.has(e.from)) deps.set(e.from, []);
    deps.get(e.from)!.push(e.to);
  }

  const rowOf = new Map<string, number>();
  const pos = new Map<string, Positioned>();
  let x = PAD;
  let maxH = 0;

  for (const layer of layers) {
    const ids = byLayer.get(layer)!;
    const colW = Math.max(...ids.map(measure));
    ids.sort((a, b) => {
      const avg = (id: string) => {
        const rows = (deps.get(id) ?? []).map((d) => rowOf.get(d)).filter((r): r is number => r !== undefined);
        return rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : Number.MAX_SAFE_INTEGER;
      };
      return avg(a) - avg(b) || a.localeCompare(b);
    });
    ids.forEach((id, row) => {
      rowOf.set(id, row);
      pos.set(id, { id, x, y: PAD + row * (NODE_H + ROW_GAP), w: colW, h: NODE_H });
    });
    maxH = Math.max(maxH, PAD * 2 + ids.length * (NODE_H + ROW_GAP) - ROW_GAP);
    x += colW + LAYER_GAP;
  }

  return { positions: pos, width: x - LAYER_GAP + PAD, height: maxH };
}

/** Rough text width so we don't need a canvas measurement pass. */
export function estimateWidth(text: string): number {
  return Math.max(120, Math.round(text.length * 7.2) + 48);
}
