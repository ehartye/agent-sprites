import { renderCellNative } from "./runtime/server/web/public/js/cell-raster.js";
import { compileComposition } from "./runtime/server/engine/composition.js";
import { createBitmapFont } from "./runtime/server/build/ui-runtime.mjs";
import { atlasFrames, orderedFrames, frameIndexAt } from "./model.js";
import { scenes } from "./feature-guide.mjs";

const cache = new Map();
export async function json(url) {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw Error(`Could not load ${url}`);
          return r.json();
        })
        .catch((e) => {
          cache.delete(url);
          throw e;
        }),
    );
  return cache.get(url);
}
export function image(url) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error(`Could not load ${url}`));
    i.src = url;
  });
}
const shape = (name, type, color, params) => ({
  name,
  type,
  color,
  params,
  visible: true,
});
const rect = (name, c, x, y, w, h, extra = {}) =>
  shape(name, "rect", c, { x, y, w, h, filled: true, ...extra });
const circle = (name, c, cx, cy, r) =>
  shape(name, "circle", c, { cx, cy, r, filled: true });
function palette(project) {
  const map = Object.fromEntries(
    (project.palette ?? []).map((p) => [p.name, p.color]),
  );
  return (c) => map[c] ?? c;
}
export function drawCell(canvas, cell, w, h, project = {}, options = {}) {
  const scale = Math.max(1, Math.min(8, Math.floor(288 / Math.max(w, h))));
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const source = renderCellNative(
    [...cell.shapes].sort((a, b) => a.zIndex - b.zIndex),
    w,
    h,
    palette(project),
    {
      background: project.background,
      palette: project.palette,
      lighting: cell.lighting,
      ...options,
    },
  );
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
}
export function drawAtlas(canvas, img, entry, scale = 4) {
  const f = entry.frame,
    s = entry.spriteSourceSize ?? { x: 0, y: 0 },
    size = entry.sourceSize ?? { w: f.w, h: f.h };
  canvas.width = size.w * scale;
  canvas.height = size.h * scale;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  if (entry.rotated) {
    ctx.save();
    ctx.translate(s.x * scale, (s.y + f.w) * scale);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w * scale, f.h * scale);
    ctx.restore();
  } else
    ctx.drawImage(
      img,
      f.x,
      f.y,
      f.w,
      f.h,
      s.x * scale,
      s.y * scale,
      f.w * scale,
      f.h * scale,
    );
}
function scaffold(host, controls, { dark = false } = {}) {
  host.innerHTML = `<div class="stage${dark ? " dark" : ""}"><canvas aria-label="Interactive pixel-art example" role="img"></canvas></div><div class="lab-controls">${controls}</div><output class="lab-output"></output>`;
  return {
    canvas: host.querySelector("canvas"),
    out: host.querySelector("output"),
    q: (s) => host.querySelector(s),
  };
}
const select = (id, title, options) =>
  `<label>${title}<select id="${id}">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`;
const range = (id, title, min, max, value) =>
  `<label>${title}<input type="range" id="${id}" min="${min}" max="${max}" value="${value}"></label>`;
export async function mountLab(
  id,
  host,
  { motion = () => true, onError = () => {} } = {},
) {
  let disposed = false,
    raf = 0;
  const tick = (fn) => {
    let last;
    function run(now) {
      if (disposed) return;
      try {
        fn(now, last);
        last = now;
      } catch (e) {
        onError(e);
        return;
      }
      raf = requestAnimationFrame(run);
    }
    raf = requestAnimationFrame(run);
  };
  const dispose = () => {
    disposed = true;
    cancelAnimationFrame(raf);
  };
  try {
    if (id === "shapes") {
      const { canvas, out, q } = scaffold(
        host,
        `${select("part", "Named part", [
          ["antenna", "antenna"],
          ["shell", "shell"],
          ["badge", "badge"],
        ])}<div class="control-row"><button id="left">← Move</button><button id="right">Move →</button></div>${select(
          "color",
          "Color",
          [
            ["#e8aa58", "Amber"],
            ["#78b1b1", "Sea glass"],
            ["#c49ac7", "Orchid"],
          ],
        )}${select("pattern", "Fill", [
          ["solid", "Solid"],
          ["checker", "Checker"],
          ["stripes", "Stripes"],
          ["sparse", "Sparse"],
          ["scatter", "Scatter"],
        ])}<label>ASCII expression · 6 × 3<textarea id="ascii" rows="3" spellcheck="false" aria-label="ASCII patch rows">W....W\n......\n.WWWW.</textarea></label><div class="control-row"><button id="patch">Apply patch</button><button id="undo" disabled>Undo</button></div><p class="lab-note">B = ink · W = cream<br>. = keep · _ = erase</p>`,
      );
      let shapes = [
        rect("floor", "#a5b4a4", 0, 34, 48, 6),
        shape("shadow", "ellipse", "#738e80", {
          cx: 25,
          cy: 35,
          rx: 14,
          ry: 2,
          filled: true,
        }),
        rect("antenna", "#e8aa58", 23, 2, 2, 7),
        circle("signal", "#fff0c2", 24, 3, 2),
        rect("shell-outline", "#293b41", 9, 9, 30, 23),
        rect("shell", "#e8aa58", 10, 10, 28, 21),
        rect("shell-highlight", "#f9d28c", 11, 11, 25, 2),
        rect("face", "#293b41", 15, 14, 18, 10),
        rect("eye-left", "#f8f0d3", 18, 16, 2, 3),
        rect("eye-right", "#f8f0d3", 28, 16, 2, 3),
        rect("badge", "#ef6949", 21, 27, 6, 2),
        rect("leg-left", "#293b41", 14, 31, 5, 4),
        rect("leg-right", "#293b41", 29, 31, 5, 4),
        rect("foot-left", "#415b5c", 12, 34, 8, 2),
        rect("foot-right", "#415b5c", 28, 34, 8, 2),
      ];
      const history = [];
      const render = () => {
        drawCell(
          canvas,
          { shapes: shapes.map((s, i) => ({ ...s, zIndex: i })) },
          48,
          40,
        );
        const selected = shapes.find((s) => s.name === q("#part").value);
        out.textContent = `${selected.name} · ${selected.type}\n${JSON.stringify(selected.params)}\n${shapes.length} editable shapes · ${history.length} undo steps`;
        q("#undo").disabled = !history.length;
      };
      const edit = (fn) => {
        history.push(structuredClone(shapes));
        fn();
        render();
      };
      for (const [button, dx] of [
        ["left", -1],
        ["right", 1],
      ])
        q(`#${button}`).onclick = () =>
          edit(() => {
            const s = shapes.find((s) => s.name === q("#part").value);
            s.params.x += dx;
          });
      q("#color").onchange = () =>
        edit(() => {
          shapes.find((s) => s.name === q("#part").value).color =
            q("#color").value;
        });
      q("#pattern").onchange = () =>
        edit(() => {
          const p = shapes.find((s) => s.name === "shell").params;
          delete p.pattern;
          delete p.color2;
          if (q("#pattern").value !== "solid") {
            p.pattern = q("#pattern").value;
            p.color2 = "#ba784c";
          }
        });
      q("#part").onchange = render;
      q("#undo").onclick = () => {
        if (history.length) {
          shapes = history.pop();
          render();
        }
      };
      q("#patch").onclick = () => {
        try {
          const rows = q("#ascii").value.replace(/\r/g, "").split("\n");
          if (
            rows.length !== 3 ||
            rows.some((r) => r.length !== 6 || /[^.BW_]/.test(r))
          )
            throw Error(
              "Use exactly three rows of six characters: B, W, . or _.",
            );
          if (rows.every((r) => /^\.+$/.test(r))) {
            onError(null);
            return;
          }
          edit(() => {
            rows.forEach((r, y) =>
              [...r].forEach((c, x) => {
                if (c === ".") return;
                const name = `expression:${21 + x},${17 + y}`;
                shapes = shapes.filter((s) => s.name !== name);
                shapes.push(
                  shape(name, "point", c === "W" ? "#f8f0d3" : "#293b41", {
                    x: 21 + x,
                    y: 17 + y,
                    ...(c === "_" ? { erase: true } : {}),
                  }),
                );
              }),
            );
          });
          onError(null);
        } catch (e) {
          onError(e);
        }
      };
      render();
    } else if (id === "composition") {
      const { canvas, out, q } = scaffold(
        host,
        `<label>Scatter seed<input id="seed" value="little-garden" maxlength="80"></label>${range("count", "Flowers", 4, 32, 18)}${range("rows", "Path rows", 1, 4, 2)}<button id="reseed">Try another seed</button><p class="lab-note">Same seed + same declaration = same shapes.<br>Uses the actual composition compiler.</p>`,
      );
      const render = () => {
        const spec = {
          cell: "0,0",
          prefix: "garden",
          parts: {
            flower: {
              shapes: [
                rect("stem", "#3d6851", 0, 0, 1, 6),
                rect("leaf", "#759754", 1, 3, 3, 1),
                circle("petals", "#d77872", 0, 0, 2),
                rect("center", "#ffdf9b", 0, 0, 1, 1),
              ],
            },
            stone: {
              shapes: [
                rect("slab", "#e3d9b2", 0, 0, 7, 3),
                rect("edge", "#9b9d7d", 0, 2, 7, 1),
              ],
            },
          },
          placements: [
            {
              kind: "tile",
              part: "stone",
              name: "path",
              x: 34,
              y: 37,
              cols: 4,
              rows: Number(q("#rows").value),
              stepX: 8,
              stepY: 4,
            },
            {
              kind: "scatter",
              part: "flower",
              name: "flowers",
              x: 7,
              y: 25,
              w: 78,
              h: 13,
              count: Number(q("#count").value),
              seed: q("#seed").value || "garden",
            },
          ],
        };
        const cell = {
          width: 96,
          height: 64,
          _nextZ: 0,
          shapes: { listByZ: () => [] },
        };
        const project = {
          cells: { resolveRef: (r) => r, getCell: () => cell },
          palette: { resolve: (c) => c },
        };
        const compiled = compileComposition(project, spec);
        const bg = [
          rect("sky", "#dce6b9", 0, 0, 96, 64),
          circle("sun", "#fff3c9", 77, 12, 6),
          rect("hedge", "#759c72", 0, 21, 96, 7),
          rect("lawn", "#a9bf81", 0, 28, 96, 36),
          rect("shade", "#92ad78", 0, 44, 96, 20),
        ];
        drawCell(
          canvas,
          {
            shapes: [...bg, ...compiled.shapes].map((s, i) => ({
              ...s,
              zIndex: i,
            })),
          },
          96,
          64,
        );
        out.textContent = `${compiled.instances.length} instances → ${compiled.shapes.length} editable shapes\n${compiled.shapes
          .slice(-3)
          .map((s) => s.name)
          .join("\n")}`;
      };
      for (const x of ["seed", "count", "rows"])
        q(`#${x}`).oninput = () => {
          try {
            render();
            onError(null);
          } catch (e) {
            onError(e);
          }
        };
      let n = 1;
      q("#reseed").onclick = () => {
        q("#seed").value = `little-garden-${n++}`;
        render();
      };
      render();
    } else if (id === "lighting") {
      const project = await json(
        "./assets/examples/surface-lighting/project.json",
      );
      if (disposed) return dispose;
      const { canvas, out, q } = scaffold(
        host,
        `${select("channel", "Render channel", [
          ["color", "Lit color"],
          ["normal", "Normal map"],
          ["light", "Light map"],
        ])}${range("lamp", "Lamp position", 3, 29, 5)}${range("ambient", "Ambient light", 0, 60, 16)}${select(
          "policy",
          "Palette policy",
          [
            ["rgb", "RGB"],
            ["nearest", "Nearest palette"],
          ],
        )}<p class="lab-note">Dome orb · beveled crate<br>Grid label · luma stone<br>Real retained surface metadata.</p>`,
        { dark: true },
      );
      const render = () => {
        const cell = structuredClone(project.cells["0,0"]);
        const x = Number(q("#lamp").value);
        const lamp = cell.shapes.find((s) => s.name === "lamp");
        lamp.params.cx = x;
        lamp.params.surface.lamps[0].x = x;
        const wire = cell.shapes.find((s) => s.name === "lamp-wire");
        wire.params.x1 = wire.params.x2 = x;
        cell.lighting.ambient = Number(q("#ambient").value) / 100;
        cell.lighting.palettePolicy = q("#policy").value;
        drawCell(canvas, cell, 32, 24, project, {
          channel: q("#channel").value,
        });
        out.textContent = `Shared surface renderer · channel: ${q("#channel").value}\nLamp x=${x} · ambient=${cell.lighting.ambient} · ${cell.lighting.palettePolicy}`;
      };
      for (const el of host.querySelectorAll("input,select"))
        el.oninput = () => {
          try {
            render();
            onError(null);
          } catch (e) {
            onError(e);
          }
        };
      render();
    } else if (id === "replay") {
      const replay = await json(
        "./assets/examples/construction-replay/replay.json",
      );
      if (disposed) return dispose;
      const { canvas, out, q } = scaffold(
        host,
        `${range("step", "Recorded operation", 0, replay.records.length - 1, 3)}<div class="control-row"><button id="prev">← Back</button><button id="next">Next →</button></div><p class="lab-note">Actual immutable snapshots, not a simulated reconstruction.</p>`,
      );
      const render = () => {
        const i = Number(q("#step").value),
          r = replay.records[i];
        drawCell(canvas, r.cells["0,0"], replay.width, replay.height, r);
        out.textContent = `${i + 1} / ${replay.records.length} · ${r.label}\n${r.source.path}${r.source.pointer ?? ""}\nSHA-256 ${r.source.sha256}`;
        q("#prev").disabled = i === 0;
        q("#next").disabled = i === replay.records.length - 1;
      };
      q("#step").oninput = render;
      for (const [s, delta] of [
        ["prev", -1],
        ["next", 1],
      ])
        q(`#${s}`).onclick = () => {
          q("#step").value = Number(q("#step").value) + delta;
          render();
        };
      render();
    } else if (id === "recipes") {
      const { canvas, out, q } = scaffold(
        host,
        `${select("recipe", "Recipe", [
          ["tileset", "Autotile & prop library"],
          ["environment", "Terrain transitions"],
          ["ui-skin", "Pixel UI skin"],
          ["ui-font", "Bitmap dialogue"],
        ])}<label id="frame-control">Exported frame<select id="frame"></select></label><label id="text-control" hidden>Dialogue<input id="text" value="A little world awaits." maxlength="50"></label><p class="lab-note">Real exported pixels. Bitmap text uses the portable UI compositor.</p>`,
      );
      let a,
        img,
        report,
        font,
        entries = [];
      const render = () => {
        if (!a || !img || !entries.length) return;
        if (q("#recipe").value === "ui-font") {
          if (!font) return;
          canvas.width = 320;
          canvas.height = 160;
          const c = canvas.getContext("2d");
          c.fillStyle = "#293b36";
          c.fillRect(0, 0, 320, 160);
          font.draw(c, q("#text").value, 20, 45, {
            scale: 2,
            maxWidth: 280,
            tone: "cream",
          });
          out.textContent = `Bitmap font · integer 2× source pixels\n${JSON.stringify(font.measure(q("#text").value, { scale: 2, maxWidth: 280 }))}`;
        } else {
          const entry = entries[Number(q("#frame").value) || 0];
          drawAtlas(
            canvas,
            img,
            entry,
            Math.min(
              8,
              Math.max(
                1,
                Math.floor(
                  256 / Math.max(entry.sourceSize.w, entry.sourceSize.h),
                ),
              ),
            ),
          );
          out.textContent = `${q("#recipe").value} / ${entry.filename}\n${entry.sourceSize.w} × ${entry.sourceSize.h} source pixels · ${entries.length} named exports`;
        }
      };
      let loadVersion = 0;
      const load = async () => {
        const version = ++loadVersion,
          id = q("#recipe").value;
        const values = await Promise.all([
          json(`./assets/examples/${id}/atlas.json`),
          image(`./assets/examples/${id}/sheet.png`),
          id === "ui-font"
            ? json("./assets/examples/ui-font/ui-report.json")
            : null,
        ]);
        if (disposed || version !== loadVersion) return;
        [a, img, report] = values;
        font = report
          ? createBitmapFont({ image: img, atlas: a, report })
          : null;
        entries = atlasFrames(a).filter((f) => !/^\d+$/.test(f.filename));
        if (!entries.length) entries = atlasFrames(a);
        q("#frame").replaceChildren(
          ...entries.map((f, i) => new Option(f.filename, i)),
        );
        q("#frame-control").hidden = id === "ui-font";
        q("#text-control").hidden = id !== "ui-font";
        render();
      };
      q("#recipe").onchange = () => load().catch(onError);
      q("#frame").onchange = render;
      q("#text").oninput = render;
      await load();
    } else if (id === "characters" || id === "animation" || id === "export") {
      const isCharacter = id === "characters",
        isExport = id === "export";
      const controls = isCharacter
        ? select("asset", "Build recipe", [
            ["native-character", "Native adventurer"],
            ["character-cast", "Community cast"],
            ["creature", "Dust ox"],
            ["tessel", "Tessel · original Foldback"],
          ])
        : isExport
          ? select(
              "asset",
              "Exported scene",
              scenes.map((s) => [s.id, s.title]),
            )
          : "";
      const { canvas, out, q } = scaffold(
        host,
        `${controls}${select("tag", "Sequence", [])}${select(
          "direction",
          "Playback direction",
          [
            ["forward", "Forward"],
            ["reverse", "Reverse"],
            ["pingpong", "Ping-pong"],
            ["pingpong_reverse", "Reverse ping-pong"],
          ],
        )}${range("scrub", "Frame", 0, 1, 0)}<button id="play" aria-pressed="false">Play animation</button>${isExport ? '<p class="lab-note">The same atlas metadata that game engines consume. PNGs remain lossless; GIFs disclose palette conversion.</p>' : '<p class="lab-note">Exact atlas durations.<br>Scrub to inspect individual poses.</p>'}`,
      );
      let a,
        img,
        frames = [],
        playing = false,
        time = 0,
        lastIndex = -1,
        version = 0,
        loop = true;
      const render = (i) => {
        if (!frames.length) return;
        const f = frames[i];
        drawAtlas(
          canvas,
          img,
          f,
          Math.min(
            8,
            Math.max(
              1,
              Math.floor(256 / Math.max(f.sourceSize.w, f.sourceSize.h)),
            ),
          ),
        );
        q("#scrub").value = i;
        out.textContent = `${f.filename} · ${i + 1} / ${frames.length} · ${f.duration} ms\n${frames.reduce((s, f) => s + f.duration, 0)} ms sequence · ${f.sourceSize.w} × ${f.sourceSize.h} source pixels${isExport ? `\nTrim: ${f.trimmed} · offset: ${f.spriteSourceSize.x},${f.spriteSourceSize.y}` : ""}`;
        lastIndex = i;
      };
      const reset = () => {
        if (!a) return;
        const tag = (a.meta.frameTags ?? []).find(
            (t) => t.name === q("#tag").value,
          ),
          all = atlasFrames(a);
        frames = orderedFrames(
          tag ? all.slice(tag.from, tag.to + 1) : all,
          q("#direction").value,
        );
        loop = tag?.loop !== false;
        q("#scrub").max = frames.length - 1;
        time = 0;
        render(0);
      };
      const load = async () => {
        const v = ++version,
          asset = isCharacter
            ? q("#asset").value
            : isExport
              ? q("#asset").value
              : "animated-composition",
          base =
            asset === "tessel"
              ? "./assets/tessel"
              : `./assets/${isExport ? "scenes" : "examples"}/${asset}`;
        const values = await Promise.all([
          json(`${base}/atlas.json`),
          image(`${base}/sheet.png`),
        ]);
        if (disposed || v !== version) return;
        [a, img] = values;
        q("#tag").replaceChildren(
          new Option("All exported frames", "all"),
          ...(a.meta.frameTags ?? []).map((t) => new Option(t.name, t.name)),
        );
        if (a.meta.frameTags?.length)
          q("#tag").value = isCharacter
            ? (
                a.meta.frameTags.find(
                  (t) =>
                    t.name === "scuttle_right" ||
                    /walk.*(front|right)/.test(t.name),
                ) ?? a.meta.frameTags[0]
              ).name
            : a.meta.frameTags[0].name;
        reset();
      };
      q("#tag").onchange = reset;
      q("#direction").onchange = reset;
      q("#scrub").oninput = () => {
        playing = false;
        q("#play").textContent = "Play animation";
        q("#play").setAttribute("aria-pressed", "false");
        time = frames
          .slice(0, Number(q("#scrub").value))
          .reduce((s, f) => s + f.duration, 0);
        render(Number(q("#scrub").value));
      };
      q("#play").onclick = () => {
        if (!loop && time >= frames.reduce((s, f) => s + f.duration, 0))
          time = 0;
        playing = !playing;
        q("#play").textContent = playing ? "Pause animation" : "Play animation";
        q("#play").setAttribute("aria-pressed", String(playing));
      };
      if (isCharacter || isExport)
        q("#asset").onchange = () => load().catch(onError);
      await load();
      tick((now, last) => {
        if (playing && motion() && last !== undefined && frames.length) {
          time += now - last;
          const i = frameIndexAt(frames, time, loop);
          if (i !== lastIndex) render(i);
          if (!loop && time >= frames.reduce((s, f) => s + f.duration, 0)) {
            playing = false;
            q("#play").textContent = "Replay animation";
            q("#play").setAttribute("aria-pressed", "false");
          }
        }
      });
    }
  } catch (error) {
    if (!disposed) onError(error);
  }
  return dispose;
}
