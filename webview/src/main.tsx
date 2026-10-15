import { createRoot } from "react-dom/client";
import { App } from "./App";

// Styles use VS Code theme tokens so the graph matches light, dark and high-contrast themes.
const css = /* css */ `
  html, body, #root { height: 100%; margin: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); overflow: hidden; }
  .app { display: flex; flex-direction: column; height: 100%; }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
  header .tools { font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; opacity: .8; }
  header .count { opacity: .7; }
  header .warn { color: var(--vscode-editorWarning-foreground); cursor: help; }
  header button.ghost { margin-left: auto; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; border-radius: 2px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 3px 6px; }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; opacity: .8; }
  .canvas { position: relative; flex: 1; cursor: grab; user-select: none; }
  .canvas:active { cursor: grabbing; }
  svg { display: block; color: var(--vscode-foreground); }
  .node { cursor: pointer; }
  .node rect { fill: var(--vscode-editorWidget-background); stroke: var(--vscode-widget-border, var(--vscode-panel-border)); stroke-width: 1.2; transition: opacity .12s; }
  .node text { fill: var(--vscode-foreground); font-size: 12px; font-family: var(--vscode-editor-font-family, monospace); pointer-events: none; }
  .node text.version { fill: var(--vscode-descriptionForeground); font-size: 10px; }
  .node:hover rect, .node.focus rect { stroke: var(--vscode-focusBorder); stroke-width: 2; }
  .node.selected rect { fill: var(--vscode-list-activeSelectionBackground); }
  .node.selected text { fill: var(--vscode-list-activeSelectionForeground); }
  .node.dep rect { stroke: var(--vscode-charts-blue); stroke-width: 2; }
  .node.dependent rect { stroke: var(--vscode-charts-green); stroke-width: 2; }
  .node.cycle rect { stroke: var(--vscode-editorError-foreground); }
  .node.dim { opacity: .25; }
  .edge { fill: none; stroke: var(--vscode-descriptionForeground); stroke-width: 1.2; opacity: .6; transition: opacity .12s; }
  .edge.dep { stroke: var(--vscode-charts-blue); color: var(--vscode-charts-blue); stroke-width: 2; opacity: 1; }
  .edge.dependent { stroke: var(--vscode-charts-green); color: var(--vscode-charts-green); stroke-width: 2; opacity: 1; }
  .edge.cycle { stroke: var(--vscode-editorError-foreground); color: var(--vscode-editorError-foreground); stroke-dasharray: 4 3; }
  .edge.dim { opacity: .08; }
  .legend { position: absolute; right: 12px; bottom: 12px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); padding: 8px 10px; border-radius: 4px; font-size: 11px; display: grid; gap: 4px; pointer-events: none; }
  .legend .sw { display: inline-block; width: 18px; height: 0; border-top: 2px solid; margin-right: 6px; vertical-align: middle; }
  .legend .sw.dep { border-color: var(--vscode-charts-blue); }
  .legend .sw.dependent { border-color: var(--vscode-charts-green); }
  .legend .sw.cycle { border-color: var(--vscode-editorError-foreground); border-top-style: dashed; }
  .legend .hint { opacity: .6; margin-top: 2px; }
`;

const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(<App />);
