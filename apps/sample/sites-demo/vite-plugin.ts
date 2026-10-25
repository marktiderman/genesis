// Serves the genesis-sites demo (sites-demo/site.ts) from this static sample:
//
// - `vite dev` and `vite preview`: a middleware hands /sites-demo/* to
//   handleSiteRequest, so the pages come with their real headers (cache,
//   cache tag, CSP) and the forms endpoint answers.
// - `vite build`: every demo page and its assets are written into the client
//   build as static files, so the Pages site shows them too (without the
//   headers, and the forms endpoint isn't there).
//
// In a real app handleSiteRequest is the first thing your server runs; see
// packages/sites/README.md.
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { Connect, Plugin } from "vite";
import { DEMO_PREFIX, demoPaths, handleDemoRequest } from "./site";

async function toRequest(req: IncomingMessage): Promise<Request> {
  const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? "/";
  const url = `http://${req.headers.host ?? "localhost"}${path}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

function send(res: ServerResponse, response: Response): void {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}

function middleware(base: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    toRequest(req)
      .then((request) => handleDemoRequest(request, base))
      .then((response) => (response ? send(res, response) : next()))
      .catch((err: unknown) => {
        console.error("[sites-demo]", err);
        res.statusCode = 500;
        res.end("The demo site failed; see the server log.\n");
      });
  };
}

export function sitesDemo(): Plugin {
  let base = "/";
  let outDir = "";
  return {
    name: "genesis-sites-demo",
    configResolved(config) {
      base = config.base;
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use(middleware(base));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(base));
    },
    // The static copy, for the client build only (react-router builds the client into build/client).
    async writeBundle() {
      if (!outDir.endsWith(join("build", "client"))) return;
      const origin = "https://genesisone.dev";
      const root = base.replace(/\/+$/, "");
      const write = (path: string, body: string) => {
        const file = join(outDir, path.slice(root.length));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
      };
      const assets = new Set<string>();
      for (const path of await demoPaths()) {
        const res = await handleDemoRequest(new Request(`${origin}${root}${path}`), base);
        if (!res || res.status !== 200) throw new Error(`[sites-demo] ${path} answered ${res?.status ?? "nothing"} while prerendering.`);
        const html = await res.text();
        write(`${root}${path.replace(/\/$/, "")}/index.html`, html);
        for (const m of html.matchAll(/(?:href|src)="([^"]*\/_gs\/[^"]+)"/g)) assets.add(m[1]!);
      }
      for (const asset of assets) {
        const res = (await handleDemoRequest(new Request(`${origin}${asset}`), base))!;
        write(asset, await res.text());
      }
      console.log(`[sites-demo] wrote ${(await demoPaths()).length} pages and ${assets.size} assets under ${DEMO_PREFIX}/`);
    },
  };
}
