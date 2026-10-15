import * as vscode from "vscode";
import type { PackageManager, WorkspacePackage } from "./detect";
import { GraphPanel } from "./views/graphPanel";
import { PackageNode, ScriptNode } from "./views/packagesTree";
import type { WorkspaceService } from "./workspaceService";

function packageManagerFor(detected: PackageManager): PackageManager {
  const configured = vscode.workspace
    .getConfiguration("monorepoHelper")
    .get<"auto" | PackageManager>("packageManager", "auto");
  return configured === "auto" ? detected : configured;
}

/** Builds the shell command that runs `script` inside `pkg` from the repo root. */
export function buildRunCommand(
  pm: PackageManager,
  pkg: WorkspacePackage,
  script: string,
  runner: "npm" | "nx",
): string {
  if (runner === "nx") {
    const exec = pm === "pnpm" ? "pnpm exec" : pm === "yarn" ? "yarn" : pm === "bun" ? "bunx" : "npx";
    return `${exec} nx run ${pkg.name}:${script}`;
  }
  switch (pm) {
    case "pnpm":
      return `pnpm --filter ${pkg.name} run ${script}`;
    case "yarn":
      return `yarn workspace ${pkg.name} run ${script}`;
    case "bun":
      return `bun run --filter ${pkg.name} ${script}`;
    default:
      return `npm run ${script} --workspace ${pkg.name}`;
  }
}

export function registerCommands(context: vscode.ExtensionContext, service: WorkspaceService): void {
  const terminals = new Map<string, vscode.Terminal>();

  const getTerminal = (name: string, cwd: vscode.Uri): vscode.Terminal => {
    const existing = terminals.get(name);
    if (existing && existing.exitStatus === undefined) {
      return existing;
    }
    const t = vscode.window.createTerminal({ name, cwd });
    terminals.set(name, t);
    return t;
  };

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => {
      for (const [k, v] of terminals) {
        if (v === t) terminals.delete(k);
      }
    }),

    vscode.commands.registerCommand("monorepoHelper.refresh", () => service.refresh()),

    vscode.commands.registerCommand("monorepoHelper.runScript", async (node?: ScriptNode) => {
      if (!(node instanceof ScriptNode)) {
        return;
      }
      const pm = packageManagerFor(node.info.packageManager);
      const cmd = buildRunCommand(pm, node.pkg, node.script, node.runner);
      const term = getTerminal(`Monorepo: ${node.pkg.name}`, node.folder.uri);
      term.show(true);
      term.sendText(cmd, true);
    }),

    vscode.commands.registerCommand("monorepoHelper.openPackageJson", async (node?: PackageNode) => {
      if (!(node instanceof PackageNode)) return;
      const uri = vscode.Uri.joinPath(node.folder.uri, node.pkg.packageJsonPath);
      try {
        await vscode.window.showTextDocument(uri);
      } catch {
        vscode.window.showWarningMessage(`${node.pkg.name} has no package.json (Nx project.json only).`);
      }
    }),

    vscode.commands.registerCommand("monorepoHelper.revealInExplorer", async (node?: PackageNode) => {
      if (!(node instanceof PackageNode)) return;
      await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.joinPath(node.folder.uri, node.pkg.dir));
    }),

    vscode.commands.registerCommand("monorepoHelper.openTerminal", (node?: PackageNode) => {
      if (!(node instanceof PackageNode)) return;
      const t = vscode.window.createTerminal({
        name: node.pkg.name,
        cwd: vscode.Uri.joinPath(node.folder.uri, node.pkg.dir),
      });
      t.show();
    }),

    vscode.commands.registerCommand("monorepoHelper.quickOpenPackage", async () => {
      const items = service.packages.map(({ folder, pkg }) => ({
        label: pkg.name,
        description: pkg.version,
        detail: pkg.dir,
        folder,
        pkg,
      }));
      if (items.length === 0) {
        vscode.window.showInformationMessage("No monorepo packages detected.");
        return;
      }
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Go to package",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!picked) return;
      const uri = vscode.Uri.joinPath(picked.folder.uri, picked.pkg.packageJsonPath);
      try {
        await vscode.window.showTextDocument(uri);
      } catch {
        await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.joinPath(picked.folder.uri, picked.pkg.dir));
      }
    }),

    vscode.commands.registerCommand("monorepoHelper.showGraph", () => {
      GraphPanel.show(context.extensionUri, service);
    }),
  );
}
