// Builds two bundles:
//   dist/extension.js  - the extension host side (CommonJS, runs in Node or the web worker host)
//   dist/webview.js    - the React dependency-graph webview (browser IIFE)
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: "dist/extension.js",
  external: ["vscode"],
  // Prefer ESM builds: jsonc-parser's UMD "main" uses dynamic require("./impl/...")
  // that esbuild can't follow, which breaks activation.
  mainFields: ["module", "main"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["webview/src/main.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outfile: "dist/webview.js",
  sourcemap: !production,
  minify: production,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": production ? '"production"' : '"development"' },
  logLevel: "info",
};

async function main() {
  if (watch) {
    const [a, b] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([a.watch(), b.watch()]);
    console.log("watching...");
    return;
  }
  await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
