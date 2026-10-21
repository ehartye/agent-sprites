// Optional art refresh. Normal Pages builds use reviewed committed exports and need no native packages.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { examples } from "./feature-guide.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const skip = process.argv.includes("--copy-only");
for (const e of examples) {
  if (!skip)
    execFileSync(
      process.execPath,
      [
        join(root, "scripts/run-managed.js"),
        "build",
        join(root, "examples", e.config),
        "--json",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          SPRITE_PORT: process.env.SPRITE_PORT ?? "14794",
        },
        stdio: "pipe",
        windowsHide: true,
      },
    );
  const src = join(root, "examples", e.folder),
    dest = join(root, "site/assets/examples", e.id);
  mkdirSync(dest, { recursive: true });
  for (const [input, output] of [
    [`${e.name}.png`, "sheet.png"],
    [`${e.name}.atlas.json`, "atlas.json"],
    ...(!e.omitProject ? [[`${e.name}.project.json`, "project.json"]] : []),
    ["construction-replay.json", "replay.json"],
    ["ui-report.json", "ui-report.json"],
    ["font-proof.png", "font-proof.png"],
  ]) {
    if (!existsSync(join(src, input))) continue;
    if (output.endsWith(".json")) {
      const a = JSON.parse(readFileSync(join(src, input), "utf8"));
      if (output === "atlas.json") a.meta.image = "sheet.png";
      writeFileSync(join(dest, output), JSON.stringify(a) + "\n");
    } else copyFileSync(join(src, input), join(dest, output));
  }
  console.log(`Copied verified example ${e.id}`);
}
