import { parse as parseJsonc } from "jsonc-parser";
import type { DetectFs } from "./types";

/** Reads and parses JSON, tolerating comments and trailing commas (Rush, tsconfig-style files). */
export async function readJson<T = unknown>(fs: DetectFs, relPath: string): Promise<T | null> {
  if (!(await fs.exists(relPath))) {
    return null;
  }
  try {
    const text = await fs.readText(relPath);
    const errors: unknown[] = [];
    const value = parseJsonc(text, errors as never, { allowTrailingComma: true }) as T;
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Normalises the `workspaces` field of a package.json.
 * npm / bun use an array; yarn also allows `{ packages: [], nohoist: [] }`.
 */
export function workspacesToPatterns(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) {
    return workspaces.filter((p): p is string => typeof p === "string");
  }
  if (workspaces && typeof workspaces === "object") {
    const pk = (workspaces as { packages?: unknown }).packages;
    if (Array.isArray(pk)) {
      return pk.filter((p): p is string => typeof p === "string");
    }
  }
  return [];
}

export function normalizeDir(p: string): string {
  let out = p.replace(/\\/g, "/");
  if (out.startsWith("./")) {
    out = out.slice(2);
  }
  while (out.endsWith("/")) {
    out = out.slice(0, -1);
  }
  return out === "." ? "" : out;
}

export function dirname(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? "" : relPath.slice(0, i);
}

export function basename(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? relPath : relPath.slice(i + 1);
}
