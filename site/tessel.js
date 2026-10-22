import { frameIndexAt } from "./model.js";
import { drawAtlas, json, image } from "./labs.js";
import { TESSEL_ACTIONS, tesselSequence } from "./tessel-data.js";

const $ = (selector) => document.querySelector(selector);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const base = "./assets/tessel/";
let paused = reduced.matches;
let playing = true;
let selected = TESSEL_ACTIONS[0];
let facing = "right";
let channel = "color";
let assets;
let sequence;
let elapsed = 0;
let currentFrame = -1;
let studies = [];
let previous;

function setPaused(value) {
  paused = value;
  $("#all-motion").setAttribute("aria-pressed", String(paused));
  $("#all-motion").textContent = paused
    ? "Play all motion ▷"
    : "Pause all motion Ⅱ";
  transport();
}
setPaused(paused);
reduced.addEventListener("change", () => setPaused(reduced.matches));
document.addEventListener("visibilitychange", () => {
  previous = undefined;
});

const tabs = TESSEL_ACTIONS.map((action, index) => {
  const button = document.createElement("button");
  button.id = `action-${action.id}`;
  button.type = "button";
  button.role = "tab";
  button.setAttribute("aria-controls", "action-panel");
  button.setAttribute("aria-selected", String(index === 0));
  button.tabIndex = index === 0 ? 0 : -1;
  button.disabled = true;
  button.textContent = action.label;
  button.onclick = () => choose(action);
  button.onkeydown = (event) => {
    const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
      ? 1
      : ["ArrowLeft", "ArrowUp"].includes(event.key)
        ? -1
        : 0;
    const next = delta
      ? (index + delta + TESSEL_ACTIONS.length) % TESSEL_ACTIONS.length
      : event.key === "Home"
        ? 0
        : event.key === "End"
          ? TESSEL_ACTIONS.length - 1
          : undefined;
    if (next !== undefined) {
      event.preventDefault();
      tabs[next].focus();
      choose(TESSEL_ACTIONS[next]);
    }
  };
  return button;
});
$("#action-tabs").replaceChildren(...tabs);

function transport() {
  const finished = sequence && !sequence.loop && elapsed >= sequence.duration;
  $("#play-action").textContent = finished
    ? "Replay action ↶"
    : playing && !paused
      ? "Pause action Ⅱ"
      : "Play action ▷";
  $("#play-action").setAttribute("aria-pressed", String(playing && !paused));
}

function paint(index) {
  if (!sequence || !assets) return;
  const frame = sequence.frames[index];
  drawAtlas($("#character"), assets[channel], frame, 6);
  $("#character").setAttribute(
    "aria-label",
    `Tessel performing ${selected.label.toLowerCase()}, facing ${facing}, ${channel} channel`,
  );
  $("#pose").value = index;
  $("#frame-readout").textContent =
    `POSE ${String(index + 1).padStart(2, "0")} / 08  ·  ${frame.duration} ms hold  ·  ${sequence.duration} ms action`;
  currentFrame = index;
}

function choose(action) {
  if (!assets) return;
  selected = action;
  sequence = tesselSequence(assets.atlas, action.id, facing);
  elapsed = 0;
  playing = true;
  tabs.forEach((button, index) => {
    const active = TESSEL_ACTIONS[index].id === selected.id;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const number = TESSEL_ACTIONS.indexOf(action) + 1;
  $("#action-number").textContent =
    `${String(number).padStart(2, "0")} / ${action.label.toUpperCase()}`;
  $("#action-panel").setAttribute("aria-labelledby", `action-${action.id}`);
  $("#current-action-title").textContent = action.label;
  $("#action-description").textContent = action.note;
  $("#playback-policy").textContent = sequence.loop
    ? "LOOPING ACTION / exact exported frame timing"
    : "ONE-SHOT ACTION / holds the final pose";
  paint(0);
  transport();
  history.replaceState(null, "", `#${action.id}`);
}

function buildStudies() {
  studies = TESSEL_ACTIONS.map((action, index) => {
    const article = document.createElement("article");
    article.className = "action-study";
    const button = document.createElement("button");
    button.setAttribute(
      "aria-label",
      `Inspect ${action.label.toLowerCase()} action`,
    );
    const stage = document.createElement("div");
    stage.className = "study-stage";
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${action.label} animation study`);
    stage.append(canvas);
    const title = document.createElement("div");
    title.className = "study-title";
    const name = document.createElement("strong");
    name.textContent = action.label;
    const number = document.createElement("span");
    number.textContent = `0${index + 1} ↗`;
    title.append(name, number);
    button.append(stage, title);
    button.onclick = () => {
      choose(action);
      $("#animation-workbench").scrollIntoView({
        behavior: reduced.matches ? "instant" : "smooth",
        block: "start",
      });
    };
    const footer = document.createElement("div");
    const timing = document.createElement("span");
    timing.textContent = `${action.duration} ms / 8 poses`;
    const gif = document.createElement("a");
    gif.href = `${base}actions/${action.id}/scene.gif`;
    gif.download = "";
    gif.textContent = "GIF ↓";
    footer.append(timing, gif);
    article.append(button, footer);
    const sequence = tesselSequence(assets.atlas, action.id, facing);
    return { article, canvas, action, sequence, elapsed: 0, index: -1 };
  });
  $("#action-gallery").replaceChildren(...studies.map((s) => s.article));
  for (const study of studies) {
    drawAtlas(study.canvas, assets[channel], study.sequence.frames[0], 3);
    study.index = 0;
  }
}

async function load() {
  document
    .querySelectorAll(
      ".tessel-workbench button,.tessel-workbench select,.tessel-workbench input",
    )
    .forEach((e) => (e.disabled = true));
  try {
    const [atlas, color, normal] = await Promise.all([
      json(base + "atlas.json"),
      image(base + "sheet.png"),
      image(base + "normal.png"),
    ]);
    for (const action of TESSEL_ACTIONS)
      for (const direction of ["right", "left"]) {
        const sequence = tesselSequence(atlas, action.id, direction);
        if (
          sequence.duration !== action.duration ||
          sequence.loop !== action.loop
        )
          throw Error(`Unexpected timing policy: ${action.id}_${direction}`);
      }
    assets = { atlas, color, normal };
    $("#all-motion").onclick = () => {
      setPaused(!paused);
      transport();
    };
    $("#play-action").onclick = () => {
      if (paused) {
        setPaused(false);
        playing = true;
      } else playing = !playing;
      if (!sequence.loop && elapsed >= sequence.duration) elapsed = 0;
      transport();
    };
    $("#restart-action").onclick = () => {
      elapsed = 0;
      playing = true;
      paint(0);
      transport();
    };
    $("#pose").oninput = () => {
      const index = Number($("#pose").value);
      elapsed = sequence.frames
        .slice(0, index)
        .reduce((sum, f) => sum + f.duration, 0);
      playing = false;
      paint(index);
      transport();
    };
    $("#facing").onchange = () => {
      facing = $("#facing").value;
      sequence = tesselSequence(assets.atlas, selected.id, facing);
      paint(Math.max(0, currentFrame));
      for (const study of studies) {
        study.sequence = tesselSequence(assets.atlas, study.action.id, facing);
        drawAtlas(
          study.canvas,
          assets[channel],
          study.sequence.frames[Math.max(0, study.index)],
          3,
        );
      }
    };
    $("#channel").onchange = () => {
      channel = $("#channel").value;
      $("#specimen-channel").textContent = channel.toUpperCase();
      paint(Math.max(0, currentFrame));
      for (const study of studies)
        drawAtlas(
          study.canvas,
          assets[channel],
          study.sequence.frames[Math.max(0, study.index)],
          3,
        );
    };
    for (const button of document.querySelectorAll("[data-background]"))
      button.onclick = () => {
        $("#stage").className = `tessel-stage ${button.dataset.background}`;
        document.querySelectorAll("[data-background]").forEach((b) => {
          b.classList.toggle("chosen", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
      };
    buildStudies();
    const chooseFromHash = () =>
      choose(
        TESSEL_ACTIONS.find((a) => a.id === location.hash.slice(1)) ??
          TESSEL_ACTIONS[0],
      );
    window.addEventListener("hashchange", chooseFromHash);
    chooseFromHash();
    document
      .querySelectorAll(
        ".tessel-workbench button,.tessel-workbench select,.tessel-workbench input",
      )
      .forEach((e) => (e.disabled = false));
    function run(now) {
      const delta = previous === undefined ? 0 : now - previous;
      previous = now;
      if (!paused && !document.hidden) {
        if (playing) {
          elapsed += delta;
          const index = frameIndexAt(sequence.frames, elapsed, sequence.loop);
          if (index !== currentFrame) paint(index);
          if (!sequence.loop && elapsed >= sequence.duration) {
            playing = false;
            transport();
          }
        }
        for (const study of studies) {
          study.elapsed += delta;
          const duration =
              study.sequence.duration + (study.sequence.loop ? 0 : 400),
            at = study.elapsed % duration,
            index = frameIndexAt(
              study.sequence.frames,
              at,
              study.sequence.loop,
            );
          if (index !== study.index) {
            drawAtlas(
              study.canvas,
              assets[channel],
              study.sequence.frames[index],
              3,
            );
            study.index = index;
          }
        }
      }
      requestAnimationFrame(run);
    }
    requestAnimationFrame(run);
  } catch (error) {
    $("#tessel-error").textContent =
      `The exported specimen could not load: ${error.message}`;
    console.error(error);
  }
}
load();
