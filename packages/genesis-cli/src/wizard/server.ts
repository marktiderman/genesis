/**
 * The setup wizard's server: plain `node:http`, on 127.0.0.1 only (Phase 3 spec §2).
 *
 * - `GET /` and the page's files from the prebuilt `dist/wizard` (no Vite at runtime). They hold
 *   no data, so they need no token.
 * - `POST /session {code}`: the page swaps the one-time launch code from its URL fragment for the
 *   session token. A code works once, for 10 minutes; the token itself never goes in a URL or on
 *   a command line (the browser launcher's argv is readable by other users on a shared host).
 * - `POST /api {v, op, …}`: the settings protocol's ops plus the wizard's own (host.ts), with the
 *   bearer token, the server's own Origin and a JSON body.
 * - `GET /events`: server-sent events (a fix's output as it runs), with the bearer token.
 *
 * Every request passes the Host check first (security.ts). It tries ports 4400–4409 and shuts
 * itself down after 30 minutes without a request.
 *
 * It logs the op and status of each request, never a body: a body may carry a secret's value.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { checkApiRequest, checkHost, checkJson, checkOrigin, LAUNCH_CODE, newToken, SECURITY_HEADERS, type Refusal } from "./security.js";

/** What answers the API: one request in, a status and a JSON body out. */
export interface WizardApi {
  handle(request: unknown): Promise<{ status: number; body: unknown }>;
}

export interface WizardServerOptions {
  api: WizardApi;
  /** The built page (dist/wizard). Without one, `/` says to build the CLI. */
  staticDir?: string;
  /** The first port to try. Default 4400. */
  port?: number;
  /** How many ports to try from `port`. Default 10 (4400–4409). */
  attempts?: number;
  /** Shut down after this long without a request. Default 30 minutes. */
  idleMs?: number;
  /** A fixed token (tests). Default: 32 fresh random bytes. */
  token?: string;
  /** Where the server logs: an op and a status, never a body. */
  log?: (line: string) => void;
  /** The route the page opens on (`#…&step=<id>`). */
  step?: string;
}

export interface WizardServer {
  port: number;
  /** `http://127.0.0.1:<port>`. */
  origin: string;
  /** A link to open: the origin with a fresh one-time launch code (and the step) in the fragment. Never the token. */
  url: string;
  /** Another one-time link (each launch code works once). */
  launchUrl(): string;
  token: string;
  /** Send an event to every open `/events` stream. */
  publish(event: string, data: unknown): void;
  close(): Promise<void>;
  /** Settles when the server has stopped (closed, or idle). */
  closed: Promise<"closed" | "idle">;
}

/** The largest request body the API reads. */
export const MAX_BODY_BYTES = 1_000_000;
/** How long a launch code stays usable. */
export const LAUNCH_CODE_TTL_MS = 10 * 60_000;
const DEFAULT_IDLE_MS = 30 * 60_000;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".map": "application/json",
};

const NO_BUILD = `<!doctype html><meta charset="utf-8"><title>Genesis setup</title><p>The wizard's page isn't built. Run <code>pnpm build</code> in packages/genesis-cli.</p>`;

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": type, ...extra });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function refuse(res: ServerResponse, refusal: Refusal): void {
  sendJson(res, refusal.status, { error: { code: refusal.code, message: refusal.message } });
}

/** The body as text, or null as soon as it passes MAX_BODY_BYTES (the rest is never read). */
function readBody(req: IncomingMessage, max = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size <= max) return void chunks.push(chunk);
      req.off("data", onData);
      req.pause();
      resolve(null);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Answer 413 and drop the connection: the rest of an oversized body is never read. The socket goes
 * a moment after the answer, so the client can read it first (closing on unread data resets the
 * connection at once).
 */
function tooLarge(req: IncomingMessage, res: ServerResponse): void {
  res.on("finish", () => setTimeout(() => req.destroy(), 200).unref());
  send(res, 413, "application/json; charset=utf-8", JSON.stringify({ error: { code: "bad_request", message: `The body is over ${MAX_BODY_BYTES} bytes.` } }));
}

/** A file under `dir` for a URL path, or null: never outside it, never a dot file. */
export function staticFile(dir: string, urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel.includes("\0") || rel.includes("\\") || rel.split("/").some((p) => p.startsWith("."))) return null;
  const file = path.join(dir, rel);
  const base = realpathSync(dir);
  if (!existsSync(file)) return null;
  const real = realpathSync(file);
  if (real !== base && !real.startsWith(base + path.sep)) return null;
  return statSync(real).isFile() ? real : null;
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (err.code === "EADDRINUSE" || err.code === "EACCES") resolve(false);
      else reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    // 127.0.0.1 only: never every interface, never ::.
    server.listen(port, "127.0.0.1");
  });
}

/** Start the wizard's server on the first free port from `port`. */
export async function startWizardServer(options: WizardServerOptions): Promise<WizardServer> {
  const token = options.token ?? newToken();
  const log = options.log ?? (() => {});
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const streams = new Set<ServerResponse>();
  /** One-time launch codes and when each expires. A used code is deleted. */
  const launchCodes = new Map<string, number>();
  const useLaunchCode = (code: string): boolean => {
    const expires = launchCodes.get(code);
    launchCodes.delete(code);
    return expires !== undefined && expires > Date.now();
  };
  let port = 0;
  let idle: NodeJS.Timeout | undefined;
  let settle!: (why: "closed" | "idle") => void;
  const closed = new Promise<"closed" | "idle">((resolve) => (settle = resolve));

  const server = createServer((req, res) => {
    touch();
    void route(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: { code: "error", message: "The wizard's server failed on that request." } });
      else res.end();
    });
  });

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const hostRefusal = checkHost(req.headers, port) ?? checkOrigin(method, req.headers, port);
    if (hostRefusal) return refuse(res, hostRefusal);

    if (url.pathname === "/api") {
      if (method !== "POST") return sendJson(res, 405, { error: { code: "bad_request", message: "POST only." } });
      const refusal = checkApiRequest(method, req.headers, port, token);
      if (refusal) {
        log(`api refused (${refusal.status})`);
        return refuse(res, refusal);
      }
      const text = await readBody(req);
      if (text === null) return tooLarge(req, res);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return sendJson(res, 400, { error: { code: "bad_request", message: "The body isn't JSON." } });
      }
      const op = body && typeof body === "object" && typeof (body as { op?: unknown }).op === "string" ? (body as { op: string }).op.slice(0, 40) : "?";
      const answer = await options.api.handle(body);
      log(`${op} ${answer.status}`);
      return sendJson(res, answer.status, answer.body);
    }

    if (url.pathname === "/session") {
      if (method !== "POST") return sendJson(res, 405, { error: { code: "bad_request", message: "POST only." } });
      const refusal = checkJson(req.headers);
      if (refusal) return refuse(res, refusal);
      const text = await readBody(req, 1_000);
      if (text === null) return tooLarge(req, res);
      let code: unknown;
      try {
        code = (JSON.parse(text) as { code?: unknown } | null)?.code;
      } catch {
        code = undefined;
      }
      if (typeof code !== "string" || !LAUNCH_CODE.test(code) || !useLaunchCode(code)) {
        log("session refused");
        return sendJson(res, 401, { error: { code: "unauthenticated", message: "This link was already used or has expired. Run genesis setup again for a new one." } });
      }
      log("session 200");
      return sendJson(res, 200, { token });
    }

    if (url.pathname === "/events") {
      if (method !== "GET") return sendJson(res, 405, { error: { code: "bad_request", message: "GET only." } });
      const refusal = checkApiRequest(method, req.headers, port, token);
      if (refusal) return refuse(res, refusal);
      res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
      res.write(": connected\n\n");
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }

    if (method !== "GET" && method !== "HEAD") return sendJson(res, 405, { error: { code: "bad_request", message: "Not here." } });
    const dir = options.staticDir;
    if (!dir || !existsSync(path.join(dir, "index.html"))) {
      return url.pathname === "/" ? send(res, 200, "text/html; charset=utf-8", NO_BUILD) : send(res, 404, "text/plain; charset=utf-8", "Not found");
    }
    const file = staticFile(dir, url.pathname);
    if (!file) return send(res, 404, "text/plain; charset=utf-8", "Not found");
    return send(res, 200, TYPES[path.extname(file)] ?? "application/octet-stream", readFileSync(file));
  }

  function touch() {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => void stop("idle"), idleMs);
    idle.unref();
  }

  let stopping: Promise<void> | null = null;
  function stop(why: "closed" | "idle"): Promise<void> {
    stopping ??= new Promise<void>((resolve) => {
      if (idle) clearTimeout(idle);
      for (const s of streams) s.end();
      streams.clear();
      server.close(() => {
        settle(why);
        resolve();
      });
      server.closeAllConnections();
    });
    return stopping;
  }

  const first = options.port ?? 4400;
  const attempts = options.attempts ?? 10;
  for (let p = first; p < first + attempts; p++) {
    if (await listen(server, p)) {
      const address = server.address();
      port = typeof address === "object" && address ? address.port : p;
      break;
    }
  }
  if (!port) throw new Error(`No free port from ${first} to ${first + attempts - 1}; pass --port.`);
  touch();

  const origin = `http://127.0.0.1:${port}`;
  const launchUrl = () => {
    const code = newToken();
    launchCodes.set(code, Date.now() + LAUNCH_CODE_TTL_MS);
    return `${origin}/#${new URLSearchParams({ c: code, ...(options.step ? { step: options.step } : {}) }).toString()}`;
  };
  return {
    port,
    origin,
    url: launchUrl(),
    launchUrl,
    token,
    publish(event, data) {
      const line = `event: ${event.replace(/[^a-z.-]/g, "")}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const s of streams) s.write(line);
    },
    close: () => stop("closed"),
    closed,
  };
}
