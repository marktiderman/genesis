// @feat:media-resumable-uploads
// The browser build's hashing worker survives a real bundler: a Vite page built against dist/
// starts it, and it hashes the file. (On 6aaa6d60 Vite left the worker out, and hashing fell back
// to the main thread.) Needs dist/ built and Playwright's Chromium; skipped without them.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = resolve(__dirname, "../../../..");
const built = existsSync(join(pkg, "dist", "uploads", "client-web.js")) && existsSync(join(pkg, "dist", "uploads", "hash-worker.js"));

async function chromium() {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath()) ? chromium : undefined;
  } catch {
    return undefined;
  }
}

describe.runIf(built)("the hashing worker in a Vite build", () => {
  it("is emitted as its own self-contained file, and runs in Chromium", { timeout: 120_000 }, async () => {
    const browserType = await chromium();
    const dir = mkdtempSync(join(tmpdir(), "genesis-media-uploads-vite-"));
    try {
      mkdirSync(join(dir, "node_modules", "@marktiderman"), { recursive: true });
      symlinkSync(pkg, join(dir, "node_modules", "@marktiderman", "genesis-media"), "dir");
      writeFileSync(join(dir, "index.html"), `<!doctype html><html><body><script type="module" src="./main.js"></script></body></html>`);
      writeFileSync(
        join(dir, "main.js"),
        `import { createBrowserFileHasher, fromBlob } from "@marktiderman/genesis-media/uploads/client";
         const bytes = new Uint8Array(5 * 1024 * 1024).map((_, i) => i & 255);
         const hash = createBrowserFileHasher({ silentMs: 60000 });
         hash(fromBlob(new Blob([bytes])), () => {}).then((sha) => (window.__result = { sha }), (e) => (window.__result = { error: String(e) }));`,
      );
      const { build } = await import("vite");
      await build({ root: dir, logLevel: "silent", build: { outDir: join(dir, "out"), emptyOutDir: true } });
      const assets = readdirSync(join(dir, "out", "assets"));
      const worker = assets.find((f) => f.startsWith("hash-worker") && f.endsWith(".js"));
      expect(worker, assets.join(", ")).toBeDefined();
      // Self-contained: the worker imports nothing.
      expect(readFileSync(join(dir, "out", "assets", worker!), "utf8")).not.toMatch(/^\s*import\s|import\(/m);

      if (!browserType) return; // the build alone is checked without a browser
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript" };
      const server = createServer((req, res) => {
        const file = join(dir, "out", req.url === "/" ? "index.html" : decodeURIComponent(req.url!.split("?")[0]!));
        if (!existsSync(file)) return void res.writeHead(404).end();
        res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const port = (server.address() as { port: number }).port;
      const browser = await browserType.launch();
      try {
        const page = await browser.newPage();
        const workers: string[] = [];
        let listening = false;
        page.on("worker", (w) => {
          workers.push(w.url());
          // Our worker installed its handler: it is the package's script, running.
          void w.evaluate(() => typeof (globalThis as unknown as { onmessage: unknown }).onmessage === "function").then((v) => (listening ||= v), () => {});
        });
        await page.goto(`http://127.0.0.1:${port}/`);
        const result = await page.waitForFunction(() => (globalThis as unknown as { __result?: unknown }).__result, null, { timeout: 60_000 }).then((h) => h.jsonValue());
        const want = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(5 * 1024 * 1024).map((_, i) => i & 255))), (b) => b.toString(16).padStart(2, "0")).join("");
        expect(result).toEqual({ sha: want });
        expect(workers.some((u) => u.includes("hash-worker"))).toBe(true);
        expect(listening).toBe(true);
      } finally {
        await browser.close();
        server.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
