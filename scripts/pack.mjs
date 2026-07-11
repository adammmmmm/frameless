/**
 * Build a load-unpacked zip: extract, then Load unpacked on the folder.
 * No npm install required for end users of the zip.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const stage = path.join(dist, "tabfocus");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const zipName = `tabfocus-v${version}-unpacked.zip`;
const zipPath = path.join(dist, zipName);

const build = spawnSync(process.execPath, [path.join(root, "scripts", "build.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(path.join(root, "background.js"))) {
  console.error("background.js missing after build");
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, "src", "images", "icons"), { recursive: true });

for (const name of [
  "manifest.json",
  "background.js",
  "background.js.map",
  "LICENSE",
  "README.md",
]) {
  const from = path.join(root, name);
  if (existsSync(from)) copyFileSync(from, path.join(stage, name));
}

cpSync(path.join(root, "src", "images", "icons"), path.join(stage, "src", "images", "icons"), {
  recursive: true,
});

rmSync(zipPath, { force: true });
// tar -a -cf makes a zip on Windows 10+ / modern tar
const tar = spawnSync("tar", ["-a", "-cf", zipPath, "-C", stage, "."], {
  encoding: "utf8",
});
if (tar.status !== 0 || !existsSync(zipPath)) {
  console.error(tar.stderr || tar.stdout || "tar zip failed");
  process.exit(1);
}

const digest = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
writeFileSync(path.join(dist, "SHA256SUMS"), `${digest}  ${zipName}\n`, "utf8");

console.log(`wrote ${path.relative(root, zipPath)}`);
console.log(`${digest}  ${zipName}`);
console.log("Extract the zip, then Load unpacked → select the extracted folder.");
