#!/usr/bin/env node
/**
 * Serves a built folder the way a static host does: each page's own index.html, then 404.html
 * (or the SPA fallback) for anything else, and never a file outside the folder. Used by the smoke
 * test and the conformance run.
 *
 *   node scripts/static-server.mjs <dir> <port>
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".md": "text/markdown",
  ".woff2": "font/woff2",
};

/** Starts the server on `port` (0 for any free one) and returns it. */
export function serveStatic(dir, port = 0) {
  const root = resolve(dir);
  const fallback = [join(root, "404.html"), join(root, "__spa-fallback.html")].find((f) => existsSync(f)) ?? null;
  const inRoot = (...parts) => {
    const file = resolve(root, ...parts);
    return file.startsWith(root + sep) && existsSync(file) && statSync(file).isFile() ? file : null;
  };
  const resolveFile = (urlPath) => {
    let clean;
    try {
      clean = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
    } catch {
      return { file: fallback, status: 400 };
    }
    if (clean.includes("\0")) return { file: fallback, status: 400 };
    const rel = `.${clean.replace(/\/+$/, "")}`;
    const file = inRoot(rel) ?? inRoot(rel, "index.html");
    return file ? { file, status: 200 } : { file: fallback, status: 404 };
  };
  return createServer((req, res) => {
    const { file, status } = resolveFile(req.url ?? "/");
    if (!file) {
      res.writeHead(status, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  }).listen(port);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, port] = process.argv.slice(2);
  if (!dir || !existsSync(dir)) {
    console.error(`No folder at ${dir}. Build it first.`);
    process.exit(1);
  }
  const server = serveStatic(dir, Number(port ?? 0));
  server.on("listening", () => console.log(`Serving ${dir} at http://127.0.0.1:${server.address().port}`));
}
