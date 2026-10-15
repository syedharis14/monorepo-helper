import { useEffect, useMemo, useRef, useState } from "react";
import { estimateWidth, layout } from "./layout";
import type { FolderGraph, HostToWebview } from "./types";
import { vscode } from "./vscode";

export function App() {
  const [folders, setFolders] = useState<FolderGraph[] | null>(null);
  const [folderIdx, setFolderIdx] = useState(0);

  useEffect(() => {
    const onMessage = (e: MessageEvent<HostToWebview>) => {
      if (e.data?.type === "graph") {
        setFolders(e.data.folders);
        setFolderIdx((i) => Math.min(i, Math.max(0, e.data.folders.length - 1)));
      }
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (folders === null) {
    return <div className="empty">Loading…</div>;
  }
  if (folders.length === 0) {
    return (
      <div className="empty">
        No monorepo packages detected.
        <button onClick={() => vscode.postMessage({ type: "refresh" })}>Refresh</button>
      </div>
    );
  }

  const current = folders[folderIdx] ?? folders[0];
  return (
    <div className="app">
      <header>
        {folders.length > 1 && (
          <select value={folderIdx} onChange={(e) => setFolderIdx(Number(e.target.value))}>
            {folders.map((f) => (
              <option key={f.index} value={f.index}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        <span className="tools">{current.tools.join(" + ")}</span>
        <span className="count">{current.graph.nodes.length} packages · {current.graph.edges.length} internal deps</span>
        {current.graph.cycles.length > 0 && (
          <span className="warn" title={current.graph.cycles.map((c) => c.join(" ↔ ")).join("\n")}>
            ⚠ {current.graph.cycles.length} cycle{current.graph.cycles.length > 1 ? "s" : ""}
          </span>
        )}
        <button className="ghost" onClick={() => vscode.postMessage({ type: "refresh" })}>
          Refresh
        </button>
      </header>
      <Graph key={current.index} folder={current} />
    </div>
  );
}

function Graph({ folder }: { folder: FolderGraph }) {
  const { graph } = folder;
  const [selected, setSelected] = useState<string | undefined>(() => vscode.getState()?.selected);
  const [hover, setHover] = useState<string | undefined>();
  const [view, setView] = useState(() => ({
    zoom: vscode.getState()?.zoom ?? 1,
    pan: vscode.getState()?.pan ?? { x: 0, y: 0 },
  }));
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    vscode.setState({ selected, zoom: view.zoom, pan: view.pan });
  }, [selected, view]);

  const { positions, width, height } = useMemo(
    () => layout(graph, (id) => estimateWidth(id)),
    [graph],
  );

  // Edges touching the focused node (hover wins over selection).
  const focus = hover ?? selected;
  const related = useMemo(() => {
    if (!focus) return null;
    const deps = new Set<string>();
    const dependents = new Set<string>();
    for (const e of graph.edges) {
      if (e.from === focus) deps.add(e.to);
      if (e.to === focus) dependents.add(e.from);
    }
    return { deps, dependents };
  }, [focus, graph]);

  const cycleMembers = useMemo(() => new Set(graph.cycles.flat()), [graph]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setView((v) => ({ ...v, zoom: Math.min(3, Math.max(0.25, v.zoom * factor)) }));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("g.node")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: view.pan.x, py: view.pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    setView((v) => ({ ...v, pan: { x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) } }));
  };
  const endDrag = () => (drag.current = null);

  const open = (id: string) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return;
    vscode.postMessage({
      type: "openPackage",
      folderIndex: folder.index,
      dir: n.dir,
      packageJsonPath: n.dir ? `${n.dir}/package.json` : "package.json",
    });
  };

  return (
    <div
      className="canvas"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <svg width="100%" height="100%">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g transform={`translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})`}>
          <rect width={width} height={height} fill="transparent" />
          {graph.edges.map((e) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            // from (right column) -> to (left column): draw from the left edge of `a` to the right edge of `b`
            const x1 = a.x;
            const y1 = a.y + a.h / 2;
            const x2 = b.x + b.w;
            const y2 = b.y + b.h / 2;
            const cx = (x1 + x2) / 2;
            let cls = "edge";
            if (related) {
              if (e.from === focus) cls += " dep";
              else if (e.to === focus) cls += " dependent";
              else cls += " dim";
            }
            if (cycleMembers.has(e.from) && cycleMembers.has(e.to)) cls += " cycle";
            return (
              <path
                key={`${e.from}->${e.to}`}
                className={cls}
                d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {graph.nodes.map((n) => {
            const p = positions.get(n.id)!;
            let cls = "node";
            if (n.id === selected) cls += " selected";
            if (related) {
              if (n.id === focus) cls += " focus";
              else if (related.deps.has(n.id)) cls += " dep";
              else if (related.dependents.has(n.id)) cls += " dependent";
              else cls += " dim";
            }
            if (cycleMembers.has(n.id)) cls += " cycle";
            return (
              <g
                key={n.id}
                className={cls}
                transform={`translate(${p.x} ${p.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(undefined)}
                onClick={() => setSelected((s) => (s === n.id ? undefined : n.id))}
                onDoubleClick={() => open(n.id)}
              >
                <title>
                  {n.id}
                  {n.version ? ` v${n.version}` : ""}
                  {"\n"}
                  {n.dir || "."}
                  {"\n"}
                  {n.sources.join(", ")}
                  {"\nDouble-click to open"}
                </title>
                <rect width={p.w} height={p.h} rx="6" />
                <text x={12} y={p.h / 2 + 4}>
                  {n.private ? "🔒 " : ""}
                  {n.id}
                </text>
                {n.version && (
                  <text className="version" x={p.w - 10} y={p.h / 2 + 4} textAnchor="end">
                    {n.version}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <aside className="legend">
        <div><i className="sw dep" /> depends on</div>
        <div><i className="sw dependent" /> depended on by</div>
        <div><i className="sw cycle" /> in a cycle</div>
        <div className="hint">scroll to zoom · drag to pan · dbl-click opens</div>
      </aside>
    </div>
  );
}
