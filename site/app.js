import { features, scenes, repository } from "./feature-guide.mjs";
import { mountLab, json, image, drawAtlas } from "./labs.js";
import { atlasFrames, frameIndexAt, requestExample } from "./model.js";

const $ = (s) => document.querySelector(s),
  reduced = matchMedia("(prefers-reduced-motion: reduce)");
let paused = reduced.matches,
  noticeTimer,
  labDispose = () => {},
  chapterVersion = 0;
const announce = (text) => {
  $("#notice").textContent = text;
  $("#notice").classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $("#notice").classList.remove("show"), 2500);
};
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    announce("Copied. Ready for your local workshop.");
  } catch {
    announce("Clipboard unavailable. Select and copy the text.");
  }
}
function link(text, url, download = false) {
  const a = document.createElement("a");
  a.textContent = text;
  a.href = url;
  if (download) a.download = "";
  return a;
}
function setMotion(value) {
  paused = value;
  $("#motion-toggle").setAttribute("aria-pressed", String(paused));
  $("#motion-toggle").textContent = paused ? "Play motion ▷" : "Pause motion Ⅱ";
}
$("#motion-toggle").onclick = () => setMotion(!paused);
reduced.addEventListener("change", () => setMotion(reduced.matches));
setMotion(paused);

function inspectScene(index) {
  const s = scenes[index],
    base = `./assets/scenes/${s.id}/`;
  $("#scene-number").textContent = String(index + 1).padStart(2, "0");
  $("#scene-name").textContent = s.title;
  $("#scene-caption").textContent = s.subtitle;
  $("#scene-downloads").replaceChildren(
    link("Editable project ↓", base + "project.json", true),
    link("PNG sheet ↓", base + "sheet.png", true),
    link("Atlas ↓", base + "atlas.json", true),
    link("GIF ↓", base + "scene.gif", true),
    link("Proof receipt ↗", base + "proof.json"),
  );
  document
    .querySelectorAll(".scene-card")
    .forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
}
let scenePlayers = [];
async function setupScenes() {
  const cards = scenes.map((s, i) => {
    const b = document.createElement("button");
    b.className = "scene-card";
    b.style.setProperty("--scene-accent", s.accent);
    b.setAttribute("aria-label", `Inspect ${s.title}`);
    b.setAttribute("aria-pressed", String(i === 0));
    const c = document.createElement("canvas");
    c.width = 192;
    c.height = 128;
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", `${s.title}. ${s.subtitle}.`);
    const label = document.createElement("div");
    label.className = "scene-label";
    const title = document.createElement("strong");
    title.textContent = s.title;
    const n = document.createElement("span");
    n.textContent = `0${i + 1} ↗`;
    label.append(title, n);
    b.append(c, label);
    b.onclick = () => {
      inspectScene(i);
      $("#scene-inspector").scrollIntoView({
        behavior: reduced.matches ? "instant" : "smooth",
        block: "center",
      });
    };
    return { b, c, s };
  });
  $("#scene-grid").replaceChildren(...cards.map((c) => c.b));
  inspectScene(0);
  await Promise.all(
    cards.map(async ({ s, c }) => {
      try {
        const [a, img] = await Promise.all([
          json(`./assets/scenes/${s.id}/atlas.json`),
          image(`./assets/scenes/${s.id}/sheet.png`),
        ]);
        const tag = a.meta.frameTags.find((t) => t.name === "ambience");
        if (!tag) throw Error("Missing ambience tag");
        const frames = atlasFrames(a).slice(tag.from, tag.to + 1);
        drawAtlas(c, img, frames[0], 1);
        scenePlayers.push({ c, img, frames, index: 0, time: 0 });
      } catch (error) {
        const poster = await image(`./assets/scenes/${s.id}/poster.png`).catch(
          () => null,
        );
        if (poster) c.getContext("2d").drawImage(poster, 0, 0, 192, 128);
        console.error(error);
      }
    }),
  );
  let previous;
  function play(now) {
    if (previous !== undefined && !paused && !document.hidden) {
      for (const p of scenePlayers) {
        p.time += now - previous;
        const i = frameIndexAt(p.frames, p.time);
        if (i !== p.index) {
          drawAtlas(p.c, p.img, p.frames[i], 1);
          p.index = i;
        }
      }
    }
    previous = now;
    requestAnimationFrame(play);
  }
  requestAnimationFrame(play);
}

const tabs = features.map((f, i) => {
  const b = document.createElement("button");
  b.className = "chapter-tab";
  b.id = `tab-${f.id}`;
  b.type = "button";
  b.role = "tab";
  b.setAttribute("aria-controls", "feature-panel");
  b.setAttribute("aria-selected", "false");
  b.tabIndex = -1;
  const n = document.createElement("span");
  n.textContent = String(i + 1).padStart(2, "0");
  const title = document.createElement("strong");
  title.textContent = f.short;
  const arrow = document.createElement("b");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  b.append(n, title, arrow);
  b.onclick = () => selectFeature(f.id, true);
  b.onkeydown = (e) => {
    const delta = ["ArrowDown", "ArrowRight"].includes(e.key)
      ? 1
      : ["ArrowUp", "ArrowLeft"].includes(e.key)
        ? -1
        : 0;
    let next;
    if (delta) next = (i + delta + features.length) % features.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = features.length - 1;
    if (next !== undefined) {
      e.preventDefault();
      tabs[next].focus();
      selectFeature(features[next].id, true);
    }
  };
  return b;
});
$("#feature-tabs").replaceChildren(...tabs);

async function selectFeature(id, updateHash = false) {
  const f = features.find((f) => f.id === id) ?? features[0],
    version = ++chapterVersion;
  labDispose();
  labDispose = () => {};
  tabs.forEach((t, i) => {
    const selected = features[i].id === f.id;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
  });
  $("#feature-panel").setAttribute("aria-labelledby", `tab-${f.id}`);
  $("#feature-eyebrow").textContent = f.eyebrow;
  $("#feature-title").textContent = f.title;
  $("#feature-description").textContent = f.text;
  $("#feature-try").textContent = f.try;
  $("#feature-command").textContent = f.command;
  $("#lab-error").textContent = "";
  $("#feature-includes").replaceChildren(
    ...f.includes.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
  const project = `./assets/examples/${f.config}/project.json`;
  $("#feature-links").replaceChildren(
    link("Build config ↓", `./source/examples/${f.example}`, true),
    link(
      "Complete example ↗",
      `${repository}/tree/main/examples/${f.example.split("/").slice(0, -1).join("/")}`,
    ),
    link("Read the guide ↗", `${repository}/blob/main/${f.docs}`),
    ...(f.config !== "tileset"
      ? [link("Editable project ↓", project, true)]
      : [link("PNG + atlas ↗", "./assets/examples/tileset/atlas.json")]),
  );
  $("#copy-example").onclick = () => copy(f.command);
  // A detached lab container prevents a slow previous fetch from overwriting a newer chapter.
  const host = document.createElement("div");
  host.className = "lab";
  host.id = "lab";
  $("#lab").replaceWith(host);
  if (updateHash) history.replaceState(null, "", `#feature-${f.id}`);
  const dispose = await mountLab(f.id, host, {
    motion: () => !paused && !document.hidden,
    onError: (error) => {
      if (version === chapterVersion)
        $("#lab-error").textContent = error?.message ?? "";
    },
  });
  if (version !== chapterVersion) dispose();
  else labDispose = dispose;
}

async function setupReference() {
  const commands = await json("./commands.json");
  $("#command-total").textContent = commands.length;
  for (const category of new Set(commands.map((c) => c.category)))
    $("#command-category").append(new Option(category, category));
  function filter() {
    const term = $("#command-search").value.trim().toLowerCase(),
      category = $("#command-category").value;
    const rows = commands.filter(
      (c) =>
        (!category || c.category === category) &&
        JSON.stringify(c).toLowerCase().includes(term),
    );
    $("#command-count").textContent = rows.length
      ? `${rows.length} of ${commands.length} tools`
      : "No tools match. Try another word or category.";
    $("#command-list").replaceChildren(
      ...rows.map((c) => {
        const d = document.createElement("details");
        d.className = "command";
        const summary = document.createElement("summary"),
          title = document.createElement("strong"),
          cat = document.createElement("small");
        title.textContent = c.label;
        cat.textContent = c.category;
        summary.append(title, cat);
        const p = document.createElement("p");
        p.textContent =
          c.description ||
          `Local ${c.category.toLowerCase()} workflow. Use an active design and existing names where required.`;
        const pre = document.createElement("pre");
        pre.textContent = requestExample(c);
        const b = document.createElement("button");
        b.className = "text-button";
        b.textContent = "Copy example";
        b.onclick = () => copy(pre.textContent);
        d.append(summary, p, pre, b);
        return d;
      }),
    );
  }
  $("#command-search").oninput = filter;
  $("#command-category").onchange = filter;
  filter();
}
function readHash() {
  const match = location.hash.match(/^#feature-([a-z-]+)$/);
  if (match) selectFeature(match[1]);
}
window.addEventListener("hashchange", readHash);
setupScenes();
setupReference().catch((e) => console.error(e));
selectFeature(
  location.hash.startsWith("#feature-") ? location.hash.slice(9) : "shapes",
);
