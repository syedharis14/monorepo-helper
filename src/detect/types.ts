/**
 * The detection layer never imports `vscode`. It talks to the file system through
 * this small interface so it can run in unit tests (Node fs) and inside the extension
 * (vscode.workspace.fs), including the web extension host.
 */
export interface DetectFs {
  /** Root directory of the workspace folder, as a path with forward slashes. */
  readonly root: string;
  /** Returns true if the file exists. Path is relative to root. */
  exists(relPath: string): Promise<boolean>;
  /** Reads a file as UTF-8 text. Path is relative to root. Throws if missing. */
  readText(relPath: string): Promise<string>;
  /**
   * Returns every package.json path (relative to root, forward slashes) in the
   * workspace, excluding node_modules etc. The root package.json is included.
   */
  findPackageJsons(): Promise<string[]>;
  /** Returns every project.json path (Nx) relative to root. */
  findFiles(globPattern: string): Promise<string[]>;
}

export type MonorepoTool =
  | "npm"
  | "yarn"
  | "pnpm"
  | "bun"
  | "nx"
  | "turborepo"
  | "lerna"
  | "rush";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export interface WorkspacePackage {
  /** package.json "name", or the folder name if missing. */
  name: string;
  version?: string;
  /** Directory relative to root, forward slashes, no trailing slash. "" for the root. */
  dir: string;
  /** Path of package.json relative to root. */
  packageJsonPath: string;
  scripts: Record<string, string>;
  /** Names of other workspace packages this one depends on (deps + devDeps + peer + optional). */
  workspaceDependencies: string[];
  /** Which detectors claimed this package. */
  sources: MonorepoTool[];
  private?: boolean;
  /** Nx targets from project.json (run with `nx run <name>:<target>`). */
  nxTargets?: string[];
}

export interface DetectedTool {
  tool: MonorepoTool;
  /** Config file that proved the tool is in use, relative to root. */
  configFile: string;
  /** Glob patterns (relative to root) that this tool says contain packages. */
  patterns: string[];
  /** Explicit package directories (Rush, Nx project.json) relative to root. */
  explicitDirs?: string[];
}

export interface MonorepoInfo {
  root: string;
  tools: DetectedTool[];
  packageManager: PackageManager;
  packages: WorkspacePackage[];
  /** True if at least one workspace definition was found. */
  isMonorepo: boolean;
}

/** A detector inspects the root and returns a DetectedTool, or null if its tool isn't in use. */
export interface Detector {
  tool: MonorepoTool;
  detect(fs: DetectFs): Promise<DetectedTool | null>;
}
