import { operationsFor, timelines } from "./generate.mjs";
process.stdout.write(
  JSON.stringify(operationsFor("play", timelines.play)) + "\n",
);
