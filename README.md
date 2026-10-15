# Monorepo Helper

A VS Code extension that understands your monorepo no matter which tool built it.

It detects **npm**, **yarn**, **pnpm** and **bun** workspaces, plus **Nx**, **Turborepo**, **Lerna** and **Rush** on top of them, and gives you:

- **Packages view** in the activity bar: every workspace package, its scripts (and Nx targets), version, and which internal packages it depends on.
- **One-click script runner**: runs the script with the right package manager syntax (`pnpm --filter`, `yarn workspace`, `npm run --workspace`, `bun run --filter`, or `nx run` for Nx targets).
- **Dependency graph**: a React webview showing internal dependencies left to right (leaves on the left, apps on the right). Hover to highlight what a package depends on and what depends on it. Cycles are flagged.
- **Go to Package** quick pick (`Monorepo: Go to Package...`, or click the status bar item).
- **Multi-root aware**: each workspace folder is scanned separately.
- Works on **desktop, remote (SSH / WSL / containers) and vscode.dev**: detection runs through `vscode.workspace.fs`, not Node's `fs`.

## How detection works

| Tool | Proof it's in use | Where the package list comes from |
| --- | --- | --- |
| pnpm | `pnpm-workspace.yaml` | `packages:` globs (negations supported) |
| npm / yarn / bun | `workspaces` in root `package.json` | array or `{ packages: [] }` form; tool is named from `packageManager` field or lockfile |
| Nx | `nx.json` | package-manager workspaces **plus** every `project.json`; legacy `workspace.json` / `angular.json` `projects` map |
| Turborepo | `turbo.json` / `turbo.jsonc` | package-manager workspaces |
| Lerna | `lerna.json` | its own `packages` list (v6 and earlier) or package-manager workspaces (v7+) |
| Rush | `rush.json` (comments and trailing commas OK) | `projects[].projectFolder` |

Several tools can be active at once (Nx + pnpm, Turborepo + yarn, Lerna + npm ...). Each package shows which tools claimed it.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `monorepoHelper.packageManager` | `auto` | Force `npm`, `yarn`, `pnpm` or `bun` for running scripts. `auto` reads `packageManager` from the root `package.json`, then the lockfile. |
| `monorepoHelper.excludeGlobs` | `node_modules`, `dist`, `.git` | Globs skipped when scanning for `package.json` files. |

## Architecture

```
src/
  detect/          pure detection layer, no `vscode` import (unit tested with node:test)
    detectors.ts   one detector per tool, each returns globs or explicit dirs
    index.ts       runs all detectors, resolves globs against package.json files, links internal deps
    nodeFs.ts      DetectFs over Node fs (tests)
    vscodeFs.ts    DetectFs over vscode.workspace.fs (extension, web-safe)
  model/graph.ts   layered DAG + cycle detection (Tarjan)
  workspaceService.ts  per-folder state, file watchers, debounced rescans
  views/
    packagesTree.ts  TreeDataProvider
    graphPanel.ts    webview host side: CSP, nonce, message bridge
  commands.ts      command handlers and package-manager-specific run commands
webview/src/       React app bundled separately (esbuild, IIFE) for the graph
test-fixtures/     one sample repo per tool combination
```

The webview and the extension host talk only through `postMessage`. The host owns the data; the webview renders it and sends back intents (`openPackage`, `refresh`). Pan/zoom/selection survive panel hide/show via `vscode.setState`.

## Development

```bash
npm install
npm run watch        # rebuilds both bundles on change
# press F5 in VS Code to launch the Extension Development Host on test-fixtures/pnpm-nx

npm run test:unit    # detection + graph tests (fast, no VS Code needed)
npm run test:vscode  # integration tests in a real VS Code instance
npm run package      # builds a .vsix
```

Publishing is automated: push a `v*` tag and CI publishes to the VS Code Marketplace and Open VSX (set `VSCE_PAT` and `OVSX_PAT` secrets).

## Roadmap

- Run a script across all packages that depend on the selected one
- "Affected" view based on git diff
- Script output in a dedicated task provider instead of a terminal
- Version mismatch warnings for internal deps
