import * as vscode from "vscode";
import { detectMonorepo, type MonorepoInfo } from "./detect";
import { createVscodeFs } from "./detect/vscodeFs";

export interface FolderResult {
  folder: vscode.WorkspaceFolder;
  info: MonorepoInfo;
}

/**
 * Owns the detected state for every workspace folder (multi-root aware), re-scans on
 * config changes, and debounces file watcher events so a `pnpm install` doesn't trigger
 * fifty rescans.
 */
export class WorkspaceService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private results: FolderResult[] = [];
  private disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private scanning: Promise<void> | undefined;

  constructor(private readonly output: vscode.OutputChannel) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/{package.json,pnpm-workspace.yaml,pnpm-workspace.yml,nx.json,project.json,workspace.json,turbo.json,turbo.jsonc,lerna.json,rush.json}",
    );
    this.disposables.push(
      watcher,
      watcher.onDidChange((u) => this.scheduleRefresh(u)),
      watcher.onDidCreate((u) => this.scheduleRefresh(u)),
      watcher.onDidDelete((u) => this.scheduleRefresh(u)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("monorepoHelper")) {
          this.refresh();
        }
      }),
    );
  }

  get folders(): FolderResult[] {
    return this.results;
  }

  /** All packages across all folders, each tagged with its folder. */
  get packages() {
    return this.results.flatMap((r) => r.info.packages.map((p) => ({ folder: r.folder, info: r.info, pkg: p })));
  }

  private scheduleRefresh(uri: vscode.Uri): void {
    if (/[\\/]node_modules[\\/]/.test(uri.fsPath)) {
      return;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refresh(), 400);
  }

  async refresh(): Promise<void> {
    if (this.scanning) {
      return this.scanning;
    }
    this.scanning = this.doRefresh().finally(() => (this.scanning = undefined));
    return this.scanning;
  }

  private async doRefresh(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const excludes = vscode.workspace
      .getConfiguration("monorepoHelper")
      .get<string[]>("excludeGlobs", []);

    const next: FolderResult[] = [];
    for (const folder of folders) {
      try {
        const info = await detectMonorepo(createVscodeFs(folder, excludes));
        next.push({ folder, info });
        this.output.appendLine(
          `[${folder.name}] tools=${info.tools.map((t) => t.tool).join(",") || "none"} ` +
            `pm=${info.packageManager} packages=${info.packages.length}`,
        );
      } catch (err) {
        this.output.appendLine(`[${folder.name}] detection failed: ${String(err)}`);
      }
    }
    this.results = next;
    const any = next.some((r) => r.info.isMonorepo);
    await vscode.commands.executeCommand("setContext", "monorepoHelper.hasMonorepo", any);
    this._onDidChange.fire();
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this._onDidChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
