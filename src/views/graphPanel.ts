import * as vscode from "vscode";
import { buildGraph, type DependencyGraph } from "../model/graph";
import type { WorkspaceService } from "../workspaceService";

/** Messages the webview sends to the extension host. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "openPackage"; folderIndex: number; dir: string; packageJsonPath: string }
  | { type: "refresh" };

/** Messages the extension host sends to the webview. */
export type HostToWebview = {
  type: "graph";
  folders: Array<{ name: string; index: number; tools: string[]; graph: DependencyGraph }>;
};

/**
 * Singleton webview panel showing the dependency graph. State flows one way:
 * extension host owns the data, the webview renders and sends back user intents.
 */
export class GraphPanel {
  private static current: GraphPanel | undefined;

  static show(extensionUri: vscode.Uri, service: WorkspaceService): void {
    if (GraphPanel.current) {
      GraphPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "monorepoHelper.graph",
      "Dependency Graph",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
      },
    );
    GraphPanel.current = new GraphPanel(panel, extensionUri, service);
  }

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly service: WorkspaceService,
  ) {
    panel.iconPath = new vscode.ThemeIcon("type-hierarchy");
    panel.webview.html = this.html(panel.webview, extensionUri);

    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg)),
      service.onDidChange(() => this.postGraph()),
    );
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.postGraph();
        break;
      case "refresh":
        await this.service.refresh();
        break;
      case "openPackage": {
        const folder = this.service.folders[msg.folderIndex]?.folder;
        if (!folder) return;
        try {
          await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, msg.packageJsonPath));
        } catch {
          await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.joinPath(folder.uri, msg.dir));
        }
        break;
      }
    }
  }

  private postGraph(): void {
    const payload: HostToWebview = {
      type: "graph",
      folders: this.service.folders
        .map((r, index) => ({
          name: r.folder.name,
          index,
          tools: r.info.tools.map((t) => t.tool),
          graph: buildGraph(r.info.packages),
        }))
        .filter((f) => f.graph.nodes.length > 0),
    };
    void this.panel.webview.postMessage(payload);
  }

  private html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
    const nonce = getNonce();
    // Strict CSP: only our bundled script (by nonce) and inline styles from React.
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;" />
  <title>Dependency Graph</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    GraphPanel.current = undefined;
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
