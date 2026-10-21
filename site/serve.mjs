import http from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./dist", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".ttf": "font/ttf",
  ".md": "text/plain; charset=utf-8",
  ".pxl": "text/plain; charset=utf-8",
};
http
  .createServer((req, res) => {
    try {
      const path = resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
      );
      if (path !== root && !path.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const file = statSync(path).isDirectory()
        ? resolve(path, "index.html")
        : path;
      res.setHeader(
        "Content-Type",
        types[extname(file)] ?? "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
  })
  .listen(4178, "127.0.0.1", () =>
    console.log("Agent Sprites preview: http://127.0.0.1:4178"),
  );
