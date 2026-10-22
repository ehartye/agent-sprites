import {
  cpSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  existsSync,
  lstatSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join, relative, dirname, basename } from "node:path";
import { COMMANDS } from "../server/commands/catalog.js";
import { features, scenes, examples } from "./feature-guide.mjs";

const site = fileURLToPath(new URL(".", import.meta.url)),
  root = resolve(site, ".."),
  dist = join(site, "dist");
// Recreate only this script's dedicated artifact. Never follow a linked output.
if (resolve(dirname(dist)) !== resolve(site) || basename(dist) !== "dist")
  throw Error("Invalid static output target");
if (existsSync(dist) && lstatSync(dist).isSymbolicLink())
  throw Error("Static output must not be a symbolic link");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (from, to) => {
  mkdirSync(resolve(to, ".."), { recursive: true });
  cpSync(from, to, { recursive: true });
};
for (const name of [
  "index.html",
  "style.css",
  "app.js",
  "labs.js",
  "model.js",
  "feature-guide.mjs",
  "tessel.html",
  "tessel.css",
  "tessel.js",
  "tessel-data.js",
])
  copy(join(site, name), join(dist, name));
copy(join(site, "assets"), join(dist, "assets"));
// Preserve the shared modules' exact relative import graph; no forked raster implementation.
for (const path of [
  "server/web/public/js/shared",
  "server/web/public/js/cell-raster.js",
  "server/web/public/js/erase-layer.js",
  "server/web/public/js/preview-sequences.js",
  "server/engine/composition.js",
  "server/engine/patterns.js",
  "server/build/ui-runtime.mjs",
])
  copy(join(root, path), join(dist, "runtime", path));
const excluded = new Set(["dist", "node_modules", ".git"]);
function sources(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      excluded.has(entry.name) ||
      entry.name.startsWith("dist-") ||
      entry.name.includes(".staging-") ||
      entry.name.endsWith(".build-lock")
    )
      continue;
    if (entry.isSymbolicLink())
      throw Error(
        `Cannot publish symlink ${relative(root, join(from, entry.name))}`,
      );
    const a = join(from, entry.name),
      b = join(to, entry.name);
    if (entry.isDirectory()) sources(a, b);
    else if (/\.(json|mjs|pxl|md|png|html)$/.test(entry.name)) copy(a, b);
  }
}
sources(join(root, "examples"), join(dist, "source", "examples"));
sources(join(root, "skills"), join(dist, "source", "skills"));
copy(join(root, "LICENSE"), join(dist, "LICENSE"));
writeFileSync(join(dist, ".nojekyll"), "");
writeFileSync(
  join(dist, "commands.json"),
  JSON.stringify(COMMANDS, null, 2) + "\n",
);
const coverage = {
  version: 1,
  features: features.map(({ id, example }) => ({ id, example })),
  commands: COMMANDS.map((c) => c.id),
  sourceKinds: [...new Set(examples.map((e) => e.kind))],
  scenes: scenes.map((s) => s.id),
};
for (const { id, example, docs } of features)
  for (const path of [example && `examples/${example}`, docs])
    if (path && !existsSync(join(dist, "source", path)))
      throw Error(`${id} missing source ${path}`);
writeFileSync(
  join(dist, "coverage.json"),
  JSON.stringify(coverage, null, 2) + "\n",
);
console.log(
  `Built static field guide: ${features.length} marquee chapters, ${COMMANDS.length} reference commands, ${coverage.sourceKinds.length} source kinds.`,
);
