import picomatch from "picomatch";
import { allDetectors, detectPackageManager } from "./detectors";
import type { DetectFs, DetectedTool, MonorepoInfo, MonorepoTool, WorkspacePackage } from "./types";
import { basename, dirname, normalizeDir, readJson } from "./util";

export * from "./types";
export { detectPackageManager } from "./detectors";

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface NxProjectJson {
  name?: string;
  targets?: Record<string, unknown>;
}

/**
 * Builds a matcher for workspace globs. Supports negation ("!**\/fixtures\/**")
 * and treats "." / "" as the root. Patterns are matched against package directories.
 */
export function buildDirMatcher(patterns: string[]): (dir: string) => boolean {
  const positive: string[] = [];
  const negative: string[] = [];
  for (const raw of patterns) {
    const p = normalizeDir(raw);
    if (raw.startsWith("!")) {
      negative.push(normalizeDir(raw.slice(1)));
    } else if (p === "") {
      positive.push("");
    } else {
      positive.push(p);
    }
  }
  const matchesRoot = positive.includes("");
  const pos = picomatch(positive.filter((p) => p !== ""), { dot: false });
  const neg = negative.length ? picomatch(negative, { dot: true }) : () => false;
  return (dir: string) => {
    if (dir === "") {
      return matchesRoot;
    }
    if (neg(dir)) {
      return false;
    }
    return positive.length > 0 && pos(dir);
  };
}

/**
 * Runs every detector against the workspace root and resolves the list of packages.
 * Multiple tools can be active at once (Nx + pnpm, Turborepo + yarn, Lerna + npm ...).
 */
export async function detectMonorepo(fs: DetectFs): Promise<MonorepoInfo> {
  const tools: DetectedTool[] = [];
  for (const d of allDetectors) {
    const result = await d.detect(fs);
    if (result) {
      tools.push(result);
    }
  }

  const packageManager = await detectPackageManager(fs);

  if (tools.length === 0) {
    return { root: fs.root, tools, packageManager, packages: [], isMonorepo: false };
  }

  const packageJsons = await fs.findPackageJsons();
  const dirToPkgJson = new Map<string, string>();
  for (const p of packageJsons) {
    dirToPkgJson.set(dirname(p), p);
  }

  // dir -> set of tools that claim it
  const claimed = new Map<string, Set<MonorepoTool>>();
  const claim = (dir: string, tool: MonorepoTool) => {
    if (!claimed.has(dir)) {
      claimed.set(dir, new Set());
    }
    claimed.get(dir)!.add(tool);
  };

  for (const t of tools) {
    if (t.patterns.length > 0) {
      const matches = buildDirMatcher(t.patterns);
      for (const dir of dirToPkgJson.keys()) {
        if (dir !== "" && matches(dir)) {
          claim(dir, t.tool);
        }
      }
    }
    for (const dir of t.explicitDirs ?? []) {
      claim(dir, t.tool);
    }
  }

  // Orchestrators (Turborepo, Lerna v7+, Nx) run on top of the package manager's
  // workspaces, so every package-manager package is also one of theirs. Rush is the
  // exception: it owns its project list outright.
  const pmPackages = [...claimed.entries()]
    .filter(([, s]) => s.has("npm") || s.has("yarn") || s.has("bun") || s.has("pnpm"))
    .map(([dir]) => dir);
  for (const t of tools) {
    if (t.patterns.length === 0 && t.tool !== "rush") {
      for (const dir of pmPackages) {
        claim(dir, t.tool);
      }
    }
  }

  // Fallback: something looks like a monorepo but nothing matched (e.g. only turbo.json
  // and a broken workspaces field). Use every non-root package.json.
  if (claimed.size === 0) {
    for (const dir of dirToPkgJson.keys()) {
      if (dir !== "") {
        claim(dir, tools[0].tool);
      }
    }
  }

  const packages: WorkspacePackage[] = [];
  const rawDeps = new Map<string, string[]>();
  for (const [dir, sources] of claimed) {
    const pkgJsonPath = dirToPkgJson.get(dir);
    const pkg = pkgJsonPath ? await readJson<PackageJson>(fs, pkgJsonPath) : null;

    let nxTargets: string[] | undefined;
    let nxName: string | undefined;
    if (sources.has("nx")) {
      const project = await readJson<NxProjectJson>(fs, dir ? `${dir}/project.json` : "project.json");
      if (project) {
        nxName = project.name;
        nxTargets = Object.keys(project.targets ?? {});
      }
    }

    if (!pkg && !nxTargets) {
      continue; // explicit dir with neither package.json nor project.json
    }

    packages.push({
      name: pkg?.name ?? nxName ?? basename(dir),
      version: pkg?.version,
      dir,
      packageJsonPath: pkgJsonPath ?? `${dir}/package.json`,
      scripts: pkg?.scripts ?? {},
      workspaceDependencies: [],
      sources: [...sources],
      private: pkg?.private,
      nxTargets,
    });
    rawDeps.set(dir, collectDeps(pkg));
  }

  // Second pass: resolve internal dependencies by name.
  const names = new Set(packages.map((p) => p.name));
  for (const p of packages) {
    const deps = rawDeps.get(p.dir) ?? [];
    p.workspaceDependencies = [...new Set(deps)]
      .filter((d) => names.has(d) && d !== p.name)
      .sort();
  }

  packages.sort((a, b) => a.dir.localeCompare(b.dir));

  return { root: fs.root, tools, packageManager, packages, isMonorepo: packages.length > 0 };
}

function collectDeps(pkg: PackageJson | null): string[] {
  if (!pkg) {
    return [];
  }
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ];
}
