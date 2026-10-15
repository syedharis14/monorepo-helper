import { parse as parseYaml } from "yaml";
import type { DetectFs, DetectedTool, Detector } from "./types";
import { dirname, normalizeDir, readJson, workspacesToPatterns } from "./util";

interface PackageJsonLike {
  name?: string;
  workspaces?: unknown;
  packageManager?: string;
}

async function rootPackageJson(fs: DetectFs): Promise<PackageJsonLike | null> {
  return readJson<PackageJsonLike>(fs, "package.json");
}

/* ---------------- package-manager workspaces ---------------- */

/**
 * npm, yarn and bun all read `workspaces` from the root package.json. Which one is
 * "in use" is decided by lockfile / packageManager field, so one detector handles
 * all three and labels itself with the right tool.
 */
export const packageJsonWorkspacesDetector: Detector = {
  tool: "npm",
  async detect(fs) {
    const pkg = await rootPackageJson(fs);
    if (!pkg) {
      return null;
    }
    const patterns = workspacesToPatterns(pkg.workspaces);
    if (patterns.length === 0) {
      return null;
    }
    const tool = await detectPackageManager(fs, pkg);
    // pnpm ignores package.json workspaces; it has its own detector.
    return {
      tool: tool === "pnpm" ? "npm" : tool,
      configFile: "package.json",
      patterns,
    };
  },
};

export const pnpmDetector: Detector = {
  tool: "pnpm",
  async detect(fs) {
    for (const file of ["pnpm-workspace.yaml", "pnpm-workspace.yml"]) {
      if (await fs.exists(file)) {
        try {
          const doc = parseYaml(await fs.readText(file)) as { packages?: unknown } | null;
          const patterns = Array.isArray(doc?.packages)
            ? (doc!.packages as unknown[]).filter((p): p is string => typeof p === "string")
            : [];
          return { tool: "pnpm", configFile: file, patterns };
        } catch {
          return { tool: "pnpm", configFile: file, patterns: [] };
        }
      }
    }
    return null;
  },
};

/* ---------------- orchestration tools ---------------- */

export const lernaDetector: Detector = {
  tool: "lerna",
  async detect(fs) {
    const lerna = await readJson<{ packages?: unknown; useWorkspaces?: boolean }>(fs, "lerna.json");
    if (!lerna) {
      return null;
    }
    // Lerna v7+ always uses package-manager workspaces; older versions list `packages`.
    const own = Array.isArray(lerna.packages)
      ? (lerna.packages as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    return { tool: "lerna", configFile: "lerna.json", patterns: own };
  },
};

export const turboDetector: Detector = {
  tool: "turborepo",
  async detect(fs) {
    for (const file of ["turbo.json", "turbo.jsonc"]) {
      if (await fs.exists(file)) {
        // Turborepo relies entirely on the package manager's workspaces.
        return { tool: "turborepo", configFile: file, patterns: [] };
      }
    }
    return null;
  },
};

export const nxDetector: Detector = {
  tool: "nx",
  async detect(fs) {
    if (!(await fs.exists("nx.json"))) {
      return null;
    }
    const explicitDirs = new Set<string>();

    // Modern Nx: project.json files anywhere (or package.json-based projects, handled by
    // the package-manager detector).
    for (const p of await fs.findFiles("**/project.json")) {
      explicitDirs.add(dirname(p));
    }

    // Legacy Nx / Angular: workspace.json or angular.json with a projects map.
    for (const legacy of ["workspace.json", "angular.json"]) {
      const ws = await readJson<{ projects?: Record<string, unknown> }>(fs, legacy);
      if (ws?.projects) {
        for (const value of Object.values(ws.projects)) {
          if (typeof value === "string") {
            explicitDirs.add(normalizeDir(value));
          } else if (value && typeof value === "object") {
            const root = (value as { root?: string }).root;
            if (typeof root === "string") {
              explicitDirs.add(normalizeDir(root));
            }
          }
        }
      }
    }

    return {
      tool: "nx",
      configFile: "nx.json",
      patterns: [],
      explicitDirs: [...explicitDirs],
    };
  },
};

export const rushDetector: Detector = {
  tool: "rush",
  async detect(fs) {
    const rush = await readJson<{ projects?: Array<{ projectFolder?: string }> }>(fs, "rush.json");
    if (!rush) {
      return null;
    }
    const explicitDirs = (rush.projects ?? [])
      .map((p) => p.projectFolder)
      .filter((p): p is string => typeof p === "string")
      .map(normalizeDir);
    return { tool: "rush", configFile: "rush.json", patterns: [], explicitDirs };
  },
};

export const allDetectors: Detector[] = [
  pnpmDetector,
  packageJsonWorkspacesDetector,
  nxDetector,
  turboDetector,
  lernaDetector,
  rushDetector,
];

/* ---------------- package manager ---------------- */

export async function detectPackageManager(
  fs: DetectFs,
  pkg?: PackageJsonLike | null,
): Promise<"npm" | "yarn" | "pnpm" | "bun"> {
  const rootPkg = pkg === undefined ? await rootPackageJson(fs) : pkg;
  const pm = rootPkg?.packageManager;
  if (typeof pm === "string") {
    const name = pm.split("@")[0];
    if (name === "npm" || name === "yarn" || name === "pnpm" || name === "bun") {
      return name;
    }
  }
  if (await fs.exists("pnpm-lock.yaml")) return "pnpm";
  if ((await fs.exists("bun.lockb")) || (await fs.exists("bun.lock"))) return "bun";
  if (await fs.exists("yarn.lock")) return "yarn";
  if (await fs.exists("package-lock.json")) return "npm";
  if (await fs.exists("pnpm-workspace.yaml")) return "pnpm";
  if (await fs.exists("rush.json")) {
    const rush = await readJson<{ pnpmVersion?: string; yarnVersion?: string }>(fs, "rush.json");
    if (rush?.pnpmVersion) return "pnpm";
    if (rush?.yarnVersion) return "yarn";
  }
  return "npm";
}

export type { DetectedTool };
