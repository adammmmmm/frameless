/**
 * Build a Windows-compatible load-unpacked zip via PowerShell Compress-Archive.
 * Layout:
 *   frameless-vX.Y.Z-unpacked.zip
 *     frameless/
 *       manifest.json
 *       background.js
 *       ...
 * Extract the zip, then Load unpacked → select the `frameless` folder.
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
const stageRoot = path.join(dist, "stage");
const stage = path.join(stageRoot, "frameless");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const zipName = `frameless-v${version}-unpacked.zip`;
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

rmSync(stageRoot, { recursive: true, force: true });
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

const isWin = process.platform === "win32";
const q = (v) => v.replace(/'/g, "''");

// On Windows, Compress-Archive produces Explorer-compatible zips (unlike `tar -a` on some setups).
// Elsewhere, use the system `zip`.
const pack = isWin
  ? spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference = 'Stop'; Compress-Archive -Path (Join-Path '${q(stageRoot)}' 'frameless') -DestinationPath '${q(zipPath)}' -Force`,
      ],
      { encoding: "utf8" },
    )
  : spawnSync("zip", ["-qr", "-X", zipPath, "frameless"], { cwd: stageRoot, encoding: "utf8" });
if (pack.status !== 0 || !existsSync(zipPath)) {
  console.error(pack.stderr || pack.stdout || "zip failed");
  process.exit(1);
}

const bytes = readFileSync(zipPath);
if (bytes.length < 100) {
  console.error(`zip too small (${bytes.length} bytes)`);
  process.exit(1);
}
// PK\x03\x04 local file header
if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
  console.error("zip missing PK header");
  process.exit(1);
}

const digest = createHash("sha256").update(bytes).digest("hex");
writeFileSync(path.join(dist, "SHA256SUMS"), `${digest}  ${zipName}\n`, "utf8");

// Sanity: extract to a temp dir and check the manifest is where Chrome expects it.
const verifyDir = path.join(dist, "verify-extract");
rmSync(verifyDir, { recursive: true, force: true });
const verify = isWin
  ? spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -Path '${q(zipPath)}' -DestinationPath '${q(verifyDir)}' -Force`,
      ],
      { encoding: "utf8" },
    )
  : spawnSync("unzip", ["-q", zipPath, "-d", verifyDir], { encoding: "utf8" });
if (verify.status !== 0 || !existsSync(path.join(verifyDir, "frameless", "manifest.json"))) {
  console.error(verify.stderr || verify.stdout || "extract verify failed: manifest missing");
  process.exit(1);
}
rmSync(verifyDir, { recursive: true, force: true });

console.log(`wrote ${path.relative(root, zipPath)} (${bytes.length} bytes)`);
console.log(`${digest}  ${zipName}`);
console.log("Extract → Load unpacked → select the inner frameless/ folder.");
