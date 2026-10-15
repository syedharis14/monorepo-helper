import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { PackagesTreeProvider } from "./views/packagesTree";
import { WorkspaceService } from "./workspaceService";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Dependency Drift");
  const service = new WorkspaceService(output);
  const tree = new PackagesTreeProvider(service);

  const view = vscode.window.createTreeView("monorepoHelper.packages", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "monorepoHelper.quickOpenPackage";
  service.onDidChange(() => {
    const total = service.packages.length;
    const tools = [...new Set(service.folders.flatMap((f) => f.info.tools.map((t) => t.tool)))];
    if (total === 0) {
      status.hide();
      return;
    }
    status.text = `$(package) ${total} pkgs`;
    status.tooltip = `Monorepo: ${tools.join(" + ")}. Click to go to a package.`;
    status.show();
  });

  registerCommands(context, service);
  context.subscriptions.push(output, service, view, status);

  // Don't block activation on the first scan.
  void service.refresh();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
