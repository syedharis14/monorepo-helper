import * as fs from "node:fs/promises";
import * as path from "node:path";
import picomatch from "picomatch";
import type { DetectFs } from "./types";

const DEFAULT_EXCLUDES = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/out/**"];

/** DetectFs backed by Node's fs. Used by unit tests and the CLI-free test harness. */
export function createNodeFs(root: string, excludes: string[] = DEFAULT_EXCLUDES): DetectFs {
  const absRoot = path.resolve(root);
  const isExcluded = picomatch(excludes, { dot: true });

  async function walk(dir: string, out: string[], match: (rel: string) => boolean): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(absRoot, abs).split(path.sep).join("/");
      if (isExcluded(rel) || isExcluded(rel + "/")) {
        continue;
      }
      if (e.isDirectory()) {
        await walk(abs, out, match);
      } else if (match(rel)) {
        out.push(rel);
      }
    }
  }

  return {
    root: absRoot.split(path.sep).join("/"),
    async exists(rel) {
      try {
        await fs.access(path.join(absRoot, rel));
        return true;
      } catch {
        return false;
      }
    },
    readText(rel) {
      return fs.readFile(path.join(absRoot, rel), "utf8");
    },
    async findPackageJsons() {
      const out: string[] = [];
      await walk(absRoot, out, (rel) => rel === "package.json" || rel.endsWith("/package.json"));
      return out.sort();
    },
    async findFiles(glob) {
      const m = picomatch(glob, { dot: true });
      const out: string[] = [];
      await walk(absRoot, out, (rel) => m(rel));
      return out.sort();
    },
  };
}
