import { atlasFrames, frameIndexAt } from "./model.js";
import { drawAtlas, json, image } from "./labs.js";

const $ = (selector) => document.querySelector(selector);
const scenes = {
  play: {
    tag: "little_morning",
    frames: 160,
    duration: 8000,
    title: "A little mischief",
  },
  groom: {
    tag: "paw_wash",
    frames: 120,
    duration: 6000,
    title: "A little wash",
  },
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const cache = new Map();
let paused = reduced.matches,
  elapsed = 0,
  previous,
  assets,
  frames,
  total,
  current = -1,
  channel = "color",
  studies = [],
  request = 0;
const clock = (ms) =>
  `${String(Math.floor(ms / 1000)).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}s`;

function motion(value) {
  paused = value;
  $("#cat-motion").textContent = paused ? "Play scene ▷" : "Pause scene Ⅱ";
  $("#cat-motion").setAttribute("aria-pressed", String(!paused));
}
function controls(disabled) {
  for (const element of document.querySelectorAll(
    ".cat-inspector button,.cat-inspector input,.cat-inspector select",
  ))
    element.disabled = disabled;
}
function paint(index) {
  if (!assets) return;
  drawAtlas($("#cat-canvas"), assets[channel], frames[index], 2);
  $("#cat-timeline").value = index;
  const at = frames.slice(0, index).reduce((sum, f) => sum + f.duration, 0);
  $("#cat-time").textContent =
    `${clock(at)} / ${clock(total)} · POSE ${String(index + 1).padStart(3, "0")} / ${frames.length} · ${frames[index].duration} ms`;
  const beat = [...assets.manifest.storyBeats]
    .reverse()
    .find((b) => b.frame <= index);
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
async function fetchScene(name) {
  const base = `./assets/cozy-cat-detail/${name}/`;
  const [atlas, color, normal, manifest] = await Promise.all([
    json(base + "atlas.json"),
    image(base + "sheet.png"),
    image(base + "normal.png"),
    json(base + "manifest.json"),
  ]);
  const expected = scenes[name];
  const tag = atlas.meta.frameTags.find((t) => t.name === expected.tag);
  if (!tag || tag.loop !== true) throw Error("Missing looping scene tag");
  const sequence = atlasFrames(atlas).slice(tag.from, tag.to + 1);
  if (
    manifest.width !== 384 ||
    manifest.height !== 256 ||
    manifest.sourceFrames !== expected.frames ||
    manifest.tag !== expected.tag ||
    manifest.durationMs !== expected.duration ||
    manifest.frameDurationMs !== 50 ||
    sequence.length !== expected.frames ||
    sequence.some(
      (f) => f.duration !== 50 || f.frame.w !== 384 || f.frame.h !== 256,
    )
  )
    throw Error("Unexpected scene dimensions or timing");
  const beats = manifest.storyBeats;
  if (
    !Array.isArray(beats) ||
    !beats.length ||
    beats[0].frame !== 0 ||
    beats.some(
      (b, i) =>
        !Number.isInteger(b.frame) ||
        b.frame < 0 ||
        b.frame >= sequence.length ||
        (i > 0 && b.frame <= beats[i - 1].frame) ||
        !b.title ||
        !b.description,
    )
  )
    throw Error("Invalid scene story cues");
  return { atlas, color, normal, manifest, sequence, base };
}
function scenePromise(name) {
  if (!cache.has(name))
    cache.set(
      name,
      fetchScene(name).catch((error) => {
        cache.delete(name);
        throw error;
      }),
    );
  return cache.get(name);
}
function storyCards() {
  studies = assets.manifest.storyBeats.map((beat, i) => {
    const button = document.createElement("button");
    button.className = "cat-beat";
    button.setAttribute("aria-label", `Inspect ${beat.title.toLowerCase()}`);
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const text = document.createElement("span"),
      number = document.createElement("span"),
      title = document.createElement("span"),
      description = document.createElement("span");
    text.className = "beat-text";
    number.className = "beat-number";
    title.className = "beat-title";
    description.className = "beat-description";
    number.textContent = `0${i + 1} / ${clock(beat.frame * 50)}`;
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
    drawAtlas(canvas, assets[channel], frames[beat.frame], 1);
    return { button, canvas, beat };
  });
  $("#cat-story-beats").replaceChildren(...studies.map((s) => s.button));
}
async function selectScene(name) {
  const ownRequest = ++request;
  controls(true);
  $("#cat-error").textContent = "";
  $("#cat-load-status").textContent =
    `Opening ${scenes[name].title.toLowerCase()}…`;
  $("#cat-player").setAttribute("aria-busy", "true");
  try {
    const next = await scenePromise(name);
    if (ownRequest !== request) return;
    assets = next;
    frames = next.sequence;
    total = scenes[name].duration;
    elapsed = 0;
    previous = undefined;
    $("#cat-timeline").max = frames.length - 1;
    for (const button of document.querySelectorAll("[data-cat-scene]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.catScene === name),
      );
    for (const link of document.querySelectorAll("[data-cat-file]"))
      link.href = next.base + link.dataset.catFile;
    $("#cat-scene-name").textContent = scenes[name].title;
    const url = new URL(location.href);
    if (name === "play") url.searchParams.delete("scene");
    else url.searchParams.set("scene", name);
    history.replaceState(null, "", url);
    $("#cat-channel-label").textContent =
      `${channel.toUpperCase()} / 384 × 256`;
    $("#cat-load-status").textContent =
      `${frames.length} poses · 20 frames per second`;
    storyCards();
    paint(0);
    controls(false);
  } catch (error) {
    if (ownRequest !== request) return;
    $("#cat-error").textContent =
      `The exported scene could not load: ${error.message}`;
    $("#cat-load-status").textContent = "Choose a scene to try again.";
    if (assets) controls(false);
    console.error(error);
  } finally {
    if (ownRequest === request)
      $("#cat-player").setAttribute("aria-busy", "false");
  }
}
motion(paused);
reduced.addEventListener("change", () => motion(reduced.matches));
document.addEventListener("visibilitychange", () => {
  previous = undefined;
});
$("#cat-motion").onclick = () => motion(!paused);
$("#cat-restart").onclick = () => {
  elapsed = 0;
  paint(0);
};
$("#cat-timeline").oninput = () => seek(Number($("#cat-timeline").value));
$("#cat-channel").onchange = () => {
  channel = $("#cat-channel").value;
  $("#cat-channel-label").textContent = `${channel.toUpperCase()} / 384 × 256`;
  paint(Math.max(0, current));
  for (const s of studies)
    drawAtlas(s.canvas, assets[channel], frames[s.beat.frame], 1);
};
for (const button of document.querySelectorAll("[data-cat-scene]"))
  button.onclick = () => selectScene(button.dataset.catScene);
function run(now) {
  const delta = previous === undefined ? 0 : now - previous;
  previous = now;
  if (
    assets &&
    !paused &&
    !document.hidden &&
    $("#cat-player").getAttribute("aria-busy") !== "true"
  ) {
    elapsed += delta;
    const index = frameIndexAt(frames, elapsed, true);
    if (index !== current) paint(index);
  }
  requestAnimationFrame(run);
}
requestAnimationFrame(run);
const requestedScene = new URLSearchParams(location.search).get("scene");
selectScene(Object.hasOwn(scenes, requestedScene) ? requestedScene : "play");
