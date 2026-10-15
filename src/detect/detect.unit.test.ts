import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as path from "node:path";
import { detectMonorepo, buildDirMatcher } from "./index";
import { createNodeFs } from "./nodeFs";
import { buildGraph, dependentsOf } from "../model/graph";

const fixtures = path.resolve(__dirname, "../../test-fixtures");
const load = (name: string) => detectMonorepo(createNodeFs(path.join(fixtures, name)));
const toolNames = (r: Awaited<ReturnType<typeof load>>) => r.tools.map((t) => t.tool).sort();

describe("buildDirMatcher", () => {
  it("matches star and globstar and honours negation", () => {
    const m = buildDirMatcher(["packages/*", "apps/**", "!apps/legacy/**"]);
    assert.equal(m("packages/ui"), true);
    assert.equal(m("packages/ui/sub"), false);
    assert.equal(m("apps/web"), true);
    assert.equal(m("apps/web/nested"), true);
    assert.equal(m("apps/legacy/old"), false);
    assert.equal(m("other"), false);
    assert.equal(m(""), false);
  });
  it("treats '.' as the root", () => {
    const m = buildDirMatcher([".", "libs/*"]);
    assert.equal(m(""), true);
  });
});

describe("detectMonorepo", () => {
  it("pnpm + nx: merges pnpm packages with nx project.json projects", async () => {
    const r = await load("pnpm-nx");
    assert.equal(r.isMonorepo, true);
    assert.deepEqual(toolNames(r), ["nx", "pnpm"]);
    assert.equal(r.packageManager, "pnpm");
    const names = r.packages.map((p) => p.name).sort();
    assert.deepEqual(names, ["@acme/ui", "@acme/utils", "tools-scripts", "web"]);
    // node_modules package.json must be ignored
    assert.ok(!names.includes("fake"));

    const ui = r.packages.find((p) => p.name === "@acme/ui")!;
    assert.deepEqual(ui.workspaceDependencies, ["@acme/utils"]);
    assert.deepEqual(ui.sources.sort(), ["nx", "pnpm"]);

    const web = r.packages.find((p) => p.name === "web")!;
    assert.deepEqual(web.workspaceDependencies, ["@acme/ui", "@acme/utils"]);

    const tools = r.packages.find((p) => p.name === "tools-scripts")!;
    assert.deepEqual(tools.sources, ["nx"]);
    assert.deepEqual(tools.nxTargets, ["lint", "generate"]);
  });

  it("yarn + turborepo: reads object-form workspaces, labels tool as yarn", async () => {
    const r = await load("yarn-turbo");
    assert.deepEqual(toolNames(r), ["turborepo", "yarn"]);
    assert.equal(r.packageManager, "yarn");
    assert.deepEqual(r.packages.map((p) => p.name), ["a", "b"]);
    // turbo has no own patterns, so it adopts yarn's packages
    assert.ok(r.packages.every((p) => p.sources.includes("turborepo")));
  });

  it("lerna with its own packages list + npm lock", async () => {
    const r = await load("lerna-npm");
    assert.deepEqual(toolNames(r), ["lerna"]);
    assert.equal(r.packageManager, "npm");
    assert.deepEqual(r.packages.map((p) => p.name), ["core", "deep"]);
    assert.deepEqual(r.packages[1].workspaceDependencies, ["core"]);
  });

  it("rush: parses rush.json with comments and trailing commas", async () => {
    const r = await load("rush");
    assert.deepEqual(toolNames(r), ["rush"]);
    assert.equal(r.packageManager, "pnpm");
    assert.deepEqual(r.packages.map((p) => p.dir), ["apps/portal", "libs/shared"]);
  });

  it("bun workspaces via bun.lockb", async () => {
    const r = await load("bun");
    assert.deepEqual(toolNames(r), ["bun"]);
    assert.equal(r.packageManager, "bun");
    assert.deepEqual(r.packages.map((p) => p.name), ["x"]);
  });

  it("plain project is not a monorepo", async () => {
    const r = await load("plain");
    assert.equal(r.isMonorepo, false);
    assert.deepEqual(r.tools, []);
    assert.deepEqual(r.packages, []);
  });
});

describe("graph", () => {
  it("layers packages and finds cycles", async () => {
    const r = await load("pnpm-nx");
    const g = buildGraph(r.packages);
    const layer = (n: string) => g.nodes.find((x) => x.id === n)!.layer;
    assert.equal(layer("@acme/utils"), 0);
    assert.equal(layer("@acme/ui"), 1);
    assert.equal(layer("web"), 2);
    assert.deepEqual(g.cycles, []);
    assert.deepEqual(dependentsOf(r.packages, "@acme/utils"), ["@acme/ui", "web"]);

    const cyc = buildGraph((await load("yarn-turbo")).packages);
    assert.deepEqual(cyc.cycles, [["a", "b"]]);
  });
});
