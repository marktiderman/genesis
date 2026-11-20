// Dev-only: serves the Genesis Settings handler (genesis-supabase's createSettingsHandler) from the
// Vite dev server, so the sample app (a static SPA) can show /platform-settings. In a real app the
// handler is one route on your server: `genesis settings init` writes it (packages/supabase/README.md,
// "The Settings screen in the app").
//
// Configured by apps/sample/.env.local, against a Supabase project with genesis-supabase's settings
// migrations (0020–0024) applied and the manifest written (`genesis settings sync`):
//   SETTINGS_SUPABASE_URL               the project's URL
//   SETTINGS_SUPABASE_PUBLISHABLE_KEY   its publishable (anon) key. Never the service-role key: the
//                                       handler calls the database as the signed-in person.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createSettingsHandler } from "@marktiderman/genesis-supabase/settings/server";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  // Connect strips the mount path from `req.url`; `originalUrl` keeps it.
  const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? "/";
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`http://${req.headers.host ?? "localhost"}${path}`, {
    method: req.method,
    headers,
    ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
  });
}

export function settingsDevServer(env: Record<string, string>): Plugin {
  return {
    name: "genesis-settings-dev-server",
    apply: "serve",
    configureServer(server) {
      const url = env.SETTINGS_SUPABASE_URL;
      const key = env.SETTINGS_SUPABASE_PUBLISHABLE_KEY;
      const configured = Boolean(url && key);

      // What the page needs to sign in with Supabase Auth. Nothing secret: both are public.
      server.middlewares.use("/api/genesis/settings-config", (_req, res) => {
        sendJson(res, 200, configured ? { configured, supabaseUrl: url, publishableKey: key } : { configured });
      });
      if (!configured) {
        server.middlewares.use("/api/genesis/settings", (_req, res) =>
          sendJson(res, 503, { error: { code: "error", message: "Set SETTINGS_SUPABASE_URL and SETTINGS_SUPABASE_PUBLISHABLE_KEY in apps/sample/.env.local." } }),
        );
        return;
      }

      const handler = createSettingsHandler({
        supabaseUrl: url!,
        supabaseKey: key!,
        app: { name: "Genesis sample", platforms: ["web"] },
        onError: (error) => server.config.logger.error(`[genesis-settings] ${error instanceof Error ? error.message : String(error)}`),
      });
      server.middlewares.use("/api/genesis/settings", async (req, res, next) => {
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
