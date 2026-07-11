import * as esbuild from "esbuild";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distTest = path.join(root, "dist-test");
mkdirSync(distTest, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "src", "background.ts")],
  bundle: true,
  outfile: path.join(root, "background.js"),
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  logLevel: "info",
  minify: false,
  sourcemap: true,
});

const testEntries = readdirSync(path.join(root, "src"))
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => path.join(root, "src", name));

for (const entry of testEntries) {
  const base = path.basename(entry, ".ts");
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile: path.join(distTest, `${base}.js`),
    format: "esm",
    platform: "node",
    target: ["node20"],
    logLevel: "info",
  });
}

console.log("build ok → background.js + dist-test/");
