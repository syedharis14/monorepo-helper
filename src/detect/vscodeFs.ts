import * as vscode from "vscode";
import type { DetectFs } from "./types";

/**
 * DetectFs backed by vscode.workspace.fs so detection works for remote (SSH/WSL)
 * and web (vscode.dev) workspaces without touching Node's fs.
 */
export function createVscodeFs(folder: vscode.WorkspaceFolder, excludeGlobs: string[]): DetectFs {
  const exclude = excludeGlobs.length ? `{${excludeGlobs.join(",")}}` : undefined;
  const rel = (uri: vscode.Uri) =>
    vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");

  return {
    root: folder.uri.path,
    async exists(p) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, p));
        return true;
      } catch {
        return false;
      }
    },
    async readText(p) {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, p));
      return new TextDecoder("utf-8").decode(bytes);
    },
    async findPackageJsons() {
      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, "**/package.json"),
        exclude,
      );
      return uris.map(rel).sort();
    },
    async findFiles(glob) {
      const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, glob), exclude);
      return uris.map(rel).sort();
    },
  };
}
