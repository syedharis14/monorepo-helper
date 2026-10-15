import * as vscode from "vscode";
import type { MonorepoInfo, WorkspacePackage } from "../detect";
import type { WorkspaceService } from "../workspaceService";

export type TreeNode = FolderNode | PackageNode | ScriptNode | InfoNode;

export class FolderNode extends vscode.TreeItem {
  readonly kind = "folder";
  constructor(
    readonly folder: vscode.WorkspaceFolder,
    readonly info: MonorepoInfo,
  ) {
    super(folder.name, vscode.TreeItemCollapsibleState.Expanded);
    const tools = info.tools.map((t) => t.tool).join(" + ");
    this.description = `${tools} · ${info.packages.length} packages`;
    this.iconPath = new vscode.ThemeIcon("root-folder");
    this.contextValue = "folder";
  }
}

export class PackageNode extends vscode.TreeItem {
  readonly kind = "package";
  constructor(
    readonly folder: vscode.WorkspaceFolder,
    readonly info: MonorepoInfo,
    readonly pkg: WorkspacePackage,
  ) {
    super(pkg.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = [pkg.version, pkg.dir].filter(Boolean).join("  ");
    this.tooltip = new vscode.MarkdownString(
      [
        `**${pkg.name}**${pkg.version ? ` v${pkg.version}` : ""}`,
        "",
        `\`${pkg.dir || "."}\``,
        "",
        `Detected by: ${pkg.sources.join(", ")}`,
        pkg.workspaceDependencies.length
          ? `\n\nDepends on: ${pkg.workspaceDependencies.map((d) => `\`${d}\``).join(", ")}`
          : "",
      ].join("\n"),
    );
    this.iconPath = new vscode.ThemeIcon(pkg.private ? "lock" : "package");
    this.contextValue = "package";
    this.resourceUri = vscode.Uri.joinPath(folder.uri, pkg.dir);
  }
}

export class ScriptNode extends vscode.TreeItem {
  readonly kind = "script";
  constructor(
    readonly folder: vscode.WorkspaceFolder,
    readonly info: MonorepoInfo,
    readonly pkg: WorkspacePackage,
    readonly script: string,
    readonly shellCommand: string,
    /** "npm" scripts run via the package manager; "nx" targets run via `nx run`. */
    readonly runner: "npm" | "nx",
  ) {
    super(script, vscode.TreeItemCollapsibleState.None);
    this.description = runner === "nx" ? "nx target" : shellCommand;
    this.tooltip = shellCommand;
    this.iconPath = new vscode.ThemeIcon(runner === "nx" ? "target" : "terminal");
    this.contextValue = "script";
    this.command = {
      command: "monorepoHelper.runScript",
      title: "Run Script",
      arguments: [this],
    };
  }
}

export class InfoNode extends vscode.TreeItem {
  readonly kind = "info";
  constructor(label: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = "info";
  }
}

export class PackagesTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly service: WorkspaceService) {
    service.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      const results = this.service.folders.filter((r) => r.info.isMonorepo);
      if (results.length === 1) {
        return this.packageNodes(results[0].folder, results[0].info);
      }
      return results.map((r) => new FolderNode(r.folder, r.info));
    }
    if (element.kind === "folder") {
      return this.packageNodes(element.folder, element.info);
    }
    if (element.kind === "package") {
      return this.scriptNodes(element);
    }
    return [];
  }

  private packageNodes(folder: vscode.WorkspaceFolder, info: MonorepoInfo): TreeNode[] {
    return info.packages.map((p) => new PackageNode(folder, info, p));
  }

  private scriptNodes(node: PackageNode): TreeNode[] {
    const { pkg } = node;
    const out: TreeNode[] = [];
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      out.push(new ScriptNode(node.folder, node.info, pkg, name, cmd, "npm"));
    }
    for (const target of pkg.nxTargets ?? []) {
      if (!(target in pkg.scripts)) {
        out.push(new ScriptNode(node.folder, node.info, pkg, target, `nx run ${pkg.name}:${target}`, "nx"));
      }
    }
    if (out.length === 0) {
      out.push(new InfoNode("No scripts", "circle-slash"));
    }
    if (pkg.workspaceDependencies.length) {
      out.push(new InfoNode(`Depends on ${pkg.workspaceDependencies.join(", ")}`, "references"));
    }
    return out;
  }
}
