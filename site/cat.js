import { atlasFrames, frameIndexAt } from "./model.js";
import { drawAtlas, json, image } from "./labs.js";

const $ = (selector) => document.querySelector(selector),
  base = "./assets/cozy-cat/";
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let paused = reduced.matches,
  elapsed = 0,
  previous,
  assets,
  frames,
  total,
  current = -1,
  channel = "color",
  studies = [];
function motion(value) {
  paused = value;
  $("#cat-motion").textContent = paused ? "Play short ▷" : "Pause short Ⅱ";
  $("#cat-motion").setAttribute("aria-pressed", String(!paused));
}
motion(paused);
reduced.addEventListener("change", () => motion(reduced.matches));
document.addEventListener("visibilitychange", () => {
  previous = undefined;
});
const clock = (ms) =>
  `${String(Math.floor(ms / 1000)).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}s`;
function paint(index) {
  if (!assets) return;
  drawAtlas($("#cat-canvas"), assets[channel], frames[index], 4);
  $("#cat-timeline").value = index;
  const at = frames.slice(0, index).reduce((sum, f) => sum + f.duration, 0);
  $("#cat-time").textContent =
    `${clock(at)} / ${clock(total)} · POSE ${String(index + 1).padStart(2, "0")} / ${frames.length} · ${frames[index].duration} ms`;
  const beat =
    [...assets.manifest.storyBeats].reverse().find((b) => b.frame <= index) ??
    assets.manifest.storyBeats[0];
  if ($("#story-title").textContent !== beat.title) {
    $("#story-title").textContent = beat.title;
    $("#story-description").textContent = beat.description;
  }
  $("#cat-canvas").setAttribute(
    "aria-label",
    `${beat.title}. ${beat.description} ${channel} channel.`,
  );
  current = index;
}
function seek(index) {
  elapsed = frames.slice(0, index).reduce((sum, f) => sum + f.duration, 0);
  motion(true);
  paint(index);
}
async function load() {
  try {
    const [atlas, color, normal, manifest] = await Promise.all([
      json(base + "atlas.json"),
      image(base + "sheet.png"),
      image(base + "normal.png"),
      json(base + "manifest.json"),
    ]);
    const tag = atlas.meta.frameTags.find((t) => t.name === "little_morning");
    if (!tag || tag.loop !== true)
      throw Error("Missing looping little_morning animation");
    frames = atlasFrames(atlas).slice(tag.from, tag.to + 1);
    total = frames.reduce((sum, f) => sum + f.duration, 0);
    if (
      frames.length !== 80 ||
      total !== 8000 ||
      frames.some((f) => !Number.isSafeInteger(f.duration) || f.duration < 1)
    )
      throw Error("Unexpected scene timing contract");
    if (
      !Array.isArray(manifest.storyBeats) ||
      !manifest.storyBeats.length ||
      manifest.storyBeats.some(
        (b) =>
          !Number.isInteger(b.frame) ||
          b.frame < 0 ||
          b.frame >= frames.length ||
          !b.title ||
          !b.description,
      )
    )
      throw Error("Invalid scene story cues");
    manifest.storyBeats.sort((a, b) => a.frame - b.frame);
    assets = { atlas, color, normal, manifest };
    $("#cat-timeline").max = frames.length - 1;
    studies = manifest.storyBeats.map((beat, i) => {
      const button = document.createElement("button");
      button.className = "cat-beat";
      button.setAttribute("aria-label", `Inspect ${beat.title.toLowerCase()}`);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 224;
      canvas.setAttribute("aria-hidden", "true");
      const text = document.createElement("span"),
        number = document.createElement("span"),
        title = document.createElement("span"),
        description = document.createElement("span");
      text.className = "beat-text";
      number.className = "beat-number";
      title.className = "beat-title";
      description.className = "beat-description";
      number.textContent = `0${i + 1} / ${clock(frames.slice(0, beat.frame).reduce((sum, f) => sum + f.duration, 0))}`;
      title.textContent = beat.title;
      description.textContent = beat.description;
      text.append(number, title, description);
      button.append(canvas, text);
      button.onclick = () => {
        seek(beat.frame);
        $("#cat-player").scrollIntoView({
          behavior: reduced.matches ? "instant" : "smooth",
          block: "start",
        });
      };
      drawAtlas(canvas, color, frames[beat.frame], 2);
      return { button, canvas, beat };
    });
    $("#cat-story-beats").replaceChildren(...studies.map((s) => s.button));
    $("#cat-motion").onclick = () => motion(!paused);
    $("#cat-restart").onclick = () => {
      elapsed = 0;
      paint(0);
    };
    $("#cat-timeline").oninput = () => seek(Number($("#cat-timeline").value));
    $("#cat-channel").onchange = () => {
      channel = $("#cat-channel").value;
      $("#cat-channel-label").textContent =
        `${channel.toUpperCase()} / 160 × 112`;
      paint(Math.max(0, current));
      for (const s of studies)
        drawAtlas(s.canvas, assets[channel], frames[s.beat.frame], 2);
    };
    paint(0);
    for (const e of document.querySelectorAll(
      ".cat-inspector button,.cat-inspector input,.cat-inspector select",
    ))
      e.disabled = false;
    function run(now) {
      const delta = previous === undefined ? 0 : now - previous;
      previous = now;
      if (!paused && !document.hidden) {
        elapsed += delta;
        const index = frameIndexAt(frames, elapsed, true);
        if (index !== current) paint(index);
      }
      requestAnimationFrame(run);
    }
    requestAnimationFrame(run);
  } catch (error) {
    $("#cat-error").textContent =
      `The exported scene could not load: ${error.message}`;
    console.error(error);
  }
}
load();
