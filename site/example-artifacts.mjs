import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Read every required export before any destination is written. */
export function readExampleArtifacts(source, example) {
  const required = [
    [`${example.name}.png`, "sheet.png"],
    [`${example.name}.atlas.json`, "atlas.json"],
    ...(!example.omitProject
      ? [[`${example.name}.project.json`, "project.json"]]
      : []),
  ];
  const optional = [
    ["construction-replay.json", "replay.json"],
    ["ui-report.json", "ui-report.json"],
    ["font-proof.png", "font-proof.png"],
  ];
  return [
    ...required,
    ...optional.filter(([input]) => existsSync(join(source, input))),
  ].map(([input, output]) => [output, readFileSync(join(source, input))]);
}
