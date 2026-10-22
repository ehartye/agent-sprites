import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
const args = process.argv.slice(2),
  force = args.includes("--force"),
  paths = args.filter((a) => a !== "--force");
if (paths.length !== 2)
  throw new Error(
    "Usage: node unpack.mjs input.project.json.gz output.project.json [--force]",
  );
const [input, output] = paths.map((p) => resolve(p));
if (input === output) throw new Error("Input and output must differ");
if (existsSync(output) && !force)
  throw new Error(
    "Output exists. Choose a new path or explicitly pass --force.",
  );
const bytes = gunzipSync(readFileSync(input));
const project = JSON.parse(bytes.toString("utf8"));
if (!project.cells || !project.grid || !project.cellWidth)
  throw new Error("Archive does not contain an agent-sprites project");
writeFileSync(output, bytes, { flag: force ? "w" : "wx" });
console.log(`Unpacked ${bytes.length} bytes into ${output}`);
