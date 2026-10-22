import { operationsFor, timelines } from "./generate.mjs";
process.stdout.write(
  JSON.stringify(operationsFor("groom", timelines.groom)) + "\n",
);
