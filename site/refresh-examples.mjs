// Optional art refresh. Normal Pages builds use reviewed committed exports and need no native packages.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { examples } from "./feature-guide.mjs";
import { readExampleArtifacts } from "./example-artifacts.mjs";
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
  const artifacts = readExampleArtifacts(src, e);
  mkdirSync(dest, { recursive: true });
  for (const [output, bytes] of artifacts) {
    if (output.endsWith(".json")) {
      const a = JSON.parse(bytes.toString("utf8"));
      if (output === "atlas.json") a.meta.image = "sheet.png";
      writeFileSync(join(dest, output), JSON.stringify(a) + "\n");
    } else writeFileSync(join(dest, output), bytes);
  }
  console.log(`Copied verified example ${e.id}`);
}
