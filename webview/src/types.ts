// Mirror of the host-side message types. Kept separate so the webview bundle
// never pulls in extension-host code.
export interface GraphNode {
  id: string;
  dir: string;
  version?: string;
  private?: boolean;
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
  cycles: string[][];
}
export interface FolderGraph {
  name: string;
  index: number;
  tools: string[];
  graph: DependencyGraph;
}
export type HostToWebview = { type: "graph"; folders: FolderGraph[] };
