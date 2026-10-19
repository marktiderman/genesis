// Dev-only: serves the Genesis Data Studio handler from the Vite dev server,
// so the sample app (a static SPA) can show /studio. In a real app the
// handler is one route on your server — see packages/studio-server/README.md.
//
// Configured by apps/sample/.env.local (written by studio/setup-db.mjs):
//   STUDIO_DATABASE_URL   the handler's NOINHERIT login role
//   STUDIO_AUTH           "dev"      — sign in as a seeded user (tokens minted here)
//                         "supabase" — sign in with Supabase Auth
//   STUDIO_DEV_JWT_SECRET (dev)      — signs the dev tokens
//   STUDIO_SUPABASE_URL, STUDIO_SUPABASE_PUBLISHABLE_KEY (supabase)
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { SignJWT } from "jose";
import type { Plugin } from "vite";
import {
  byResource,
  createStudioHandler,
  jwtAuth,
  supabaseAuth,
  type StudioAuth,
} from "@marktiderman/genesis-studio-server";

interface DevUser {
  id: string;
  name: string;
  note: string;
}

const DEV_USERS: DevUser[] = JSON.parse(readFileSync(new URL("./dev-users.json", import.meta.url), "utf8"));

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  // Connect strips the mount path from `req.url`; `originalUrl` keeps it.
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
    // Required by Node's fetch for a streamed request body.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

export function studioDevServer(env: Record<string, string>): Plugin {
  return {
    name: "genesis-studio-dev-server",
    apply: "serve",
    configureServer(server) {
      const mode = env.STUDIO_AUTH === "supabase" ? "supabase" : "dev";
      const configured = Boolean(env.STUDIO_DATABASE_URL);

      // What the /studio page needs to draw its sign-in slot. Nothing secret.
      server.middlewares.use("/api/studio-config", (_req, res) => {
        sendJson(res, 200, {
          configured,
          mode,
          ...(mode === "dev" ? { users: DEV_USERS } : {}),
          ...(mode === "supabase"
            ? { supabaseUrl: env.STUDIO_SUPABASE_URL, publishableKey: env.STUDIO_SUPABASE_PUBLISHABLE_KEY }
            : {}),
        });
      });
      if (!configured) {
        server.middlewares.use("/api/studio", (_req, res) =>
          sendJson(res, 503, { error: { outcome: "error", message: "Run `pnpm --filter sample studio:db` first." } }),
        );
        return;
      }

      let auth: StudioAuth;
      if (mode === "dev") {
        const secret = env.STUDIO_DEV_JWT_SECRET;
        if (!secret) throw new Error("STUDIO_DEV_JWT_SECRET is required when STUDIO_AUTH=dev");
        auth = jwtAuth({ secret, audience: "authenticated", issuer: "genesis-sample-dev" });
        // Dev sign-in: a short-lived token for one of the seeded users. Only
        // ever served by the dev server, and only in dev mode.
        server.middlewares.use("/api/studio-dev-token", async (req, res) => {
          const id = new URL(req.url ?? "/", "http://dev").searchParams.get("user");
          const user = DEV_USERS.find((u) => u.id === id);
          if (!user) return sendJson(res, 404, { error: "Unknown dev user." });
          const token = await new SignJWT({ role: "authenticated", name: user.name })
            .setProtectedHeader({ alg: "HS256" })
            .setSubject(user.id)
            .setAudience("authenticated")
            .setIssuer("genesis-sample-dev")
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(new TextEncoder().encode(secret));
          sendJson(res, 200, { token, user });
        });
      } else {
        if (!env.STUDIO_SUPABASE_URL) throw new Error("STUDIO_SUPABASE_URL is required when STUDIO_AUTH=supabase");
        auth = supabaseAuth({ url: env.STUDIO_SUPABASE_URL });
      }

      const handler = createStudioHandler({
        database: env.STUDIO_DATABASE_URL,
        auth,
        // Every table the sample offers; categories stays read-only.
        authorize: byResource(
          {
            "public.products": { read: true, update: true, create: true, delete: true, history: true },
            "public.orders": { read: true, update: true, create: true, history: true },
            "public.order_lines": { read: true, update: ["quantity", "note"], history: true },
            "public.categories": { read: true },
            // The stock-Supabase demo schema (examples/studio-supabase).
            "public.clients": { read: true, update: true, create: true, history: true },
            "public.session_notes": { read: true, update: ["summary", "next_steps"], history: true },
            "public.plans": { read: true },
          },
          // Any signed-in, non-anonymous user. A real app narrows this to staff.
          { who: (claims) => typeof claims.sub === "string" },
        ),
        audit: { sink: "table" },
        onError: (error) => server.config.logger.error(`[studio] ${error instanceof Error ? error.message : String(error)}`),
      });
      server.httpServer?.once("close", () => void handler.close());

      server.middlewares.use("/api/studio", async (req, res, next) => {
        if ((req.url ?? "/") !== "/" && (req.url ?? "/") !== "") return next();
        try {
          const response = await handler(await toRequest(req));
          res.statusCode = response.status;
          response.headers.forEach((value, name) => res.setHeader(name, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
