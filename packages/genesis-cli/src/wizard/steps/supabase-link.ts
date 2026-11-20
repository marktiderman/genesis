/**
 * `supabase.link`: link the app to its Supabase project, push the migrations, deploy the functions.
 * Verified when no migration is pending and every local function is deployed.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { defineSetupStep } from "@marktiderman/genesis-config/setup";
import { TOOL_AUTH_ENV } from "../../exec/run.js";
import { supabaseLinked } from "../../exec/secret-stores.js";
import type { PlannedCommand } from "../../fix/types.js";
import { OFFLINE, type StepContext, type StepRunner } from "./framework.js";

export const supabaseLinkStep = defineSetupStep({
  id: "supabase.link",
  title: "Link the Supabase project",
  package: "@marktiderman/genesis-supabase",
  tools: ["supabase"],
  fields: [{ name: "projectRef", label: "Project ref", pattern: "[a-z0-9]{20}", placeholder: "abcdefghijklmnopqrst", help: "Project Settings → General → Reference ID (the project list below shows it too)." }],
  links: [{ label: "Supabase projects", url: "https://supabase.com/dashboard/projects" }],
  instructions: [
    "Make a project in the Supabase dashboard if you don't have one yet, and keep its database password.",
    "Sign the Supabase CLI in once: supabase login (or set SUPABASE_ACCESS_TOKEN).",
    "If supabase asks for the database password while pushing, set SUPABASE_DB_PASSWORD in the shell you start genesis from: it is never asked for here.",
    "Then link: the CLI links the project, pushes the migrations and deploys the Edge Functions.",
  ],
});

const FUNCTION_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The app's Edge Functions: folders under supabase/functions, not `_shared` and the like. */
export function localFunctions(root: string): string[] {
  const dir = path.join(root, "supabase", "functions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => FUNCTION_NAME.test(name) && statSync(path.join(dir, name)).isDirectory())
    .sort();
}

const hasMigrations = (root: string) => {
  const dir = path.join(root, "supabase", "migrations");
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".sql"));
};

/** Migrations that are local only, from `supabase migration list --linked`'s table (`Local | Remote | Time`). */
export function pendingMigrations(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.includes("|")) continue;
    const [local, remote] = line.split("|").map((c) => c.trim());
    if (local && /^\d+$/.test(local) && !remote) out.push(local);
  }
  return out;
}

const supabase = (ctx: StepContext, args: string[]) => ctx.run("supabase", args, { cwd: ctx.root, timeoutMs: 60_000, passEnv: TOOL_AUTH_ENV["supabase"] ?? [] });

export const supabaseLink: StepRunner = {
  step: supabaseLinkStep,
  appliesTo: (root) => existsSync(path.join(root, "supabase")),
  async detect(ctx) {
    if (!ctx.network) return ["The network is off: the project list isn't read."];
    const lines: string[] = [];
    const list = await supabase(ctx, ["projects", "list", "-o", "json"]).catch((err: Error) => ({ code: 1, stdout: "", stderr: err.message }));
    if (list.code !== 0) lines.push(`supabase projects list failed: ${list.stderr.trim().split("\n")[0] ?? ""} (signed in? supabase login)`);
    else {
      try {
        const rows = JSON.parse(list.stdout) as Array<{ id?: unknown; ref?: unknown; name?: unknown; region?: unknown }>;
        for (const r of rows) {
          const ref = typeof r.ref === "string" ? r.ref : typeof r.id === "string" ? r.id : null;
          if (ref) lines.push(`${ref}  ${typeof r.name === "string" ? r.name : ""}${typeof r.region === "string" ? ` (${r.region})` : ""}`);
        }
        if (!rows.length) lines.push("No projects yet: make one in the dashboard.");
      } catch {
        lines.push("The project list couldn't be read.");
      }
    }
    if (supabaseLinked(ctx.root) && hasMigrations(ctx.root)) {
      const dry = await supabase(ctx, ["db", "push", "--dry-run"]).catch((err: Error) => ({ code: 1, stdout: "", stderr: err.message }));
      lines.push("", "supabase db push --dry-run:", ...`${dry.stdout}${dry.stderr}`.trim().split("\n").slice(-20));
    }
    return lines;
  },
  plan(ctx) {
    const ref = ctx.fields.projectRef!;
    const functions = localFunctions(ctx.root);
    const commands: PlannedCommand[] = [{ tool: "supabase", args: ["link", "--project-ref", ref], why: `links the app to the project ${ref}` }];
    if (hasMigrations(ctx.root)) commands.push({ tool: "supabase", args: ["db", "push", "--yes"], why: "applies the app's migrations to the linked database (the dry run above lists them)" });
    for (const name of functions) commands.push({ tool: "supabase", args: ["functions", "deploy", name], why: `deploys the Edge Function ${name}` });
    return { summary: `links Supabase project ${ref}${hasMigrations(ctx.root) ? ", pushes the migrations" : ""}${functions.length ? ` and deploys ${functions.length} function${functions.length === 1 ? "" : "s"}` : ""}`, commands };
  },
  async verify(ctx) {
    if (!supabaseLinked(ctx.root)) return { ok: false, message: "The app isn't linked to a Supabase project yet." };
    if (!ctx.network) return OFFLINE;
    const problems: string[] = [];
    if (hasMigrations(ctx.root)) {
      const list = await supabase(ctx, ["migration", "list", "--linked"]);
      if (list.code !== 0) problems.push(`supabase migration list failed: ${list.stderr.trim().split("\n")[0] ?? ""}`);
      else {
        const pending = pendingMigrations(list.stdout);
        if (pending.length) problems.push(`${pending.length} migration${pending.length === 1 ? " isn't" : "s aren't"} applied: ${pending.join(", ")}`);
      }
    }
    const functions = localFunctions(ctx.root);
    if (functions.length) {
      const list = await supabase(ctx, ["functions", "list", "-o", "json"]);
      if (list.code !== 0) problems.push(`supabase functions list failed: ${list.stderr.trim().split("\n")[0] ?? ""}`);
      else {
        let deployed: Set<string>;
        try {
          const rows = JSON.parse(list.stdout) as Array<{ slug?: unknown; name?: unknown }>;
          deployed = new Set(rows.flatMap((r) => [r.slug, r.name].filter((v): v is string => typeof v === "string")));
        } catch {
          deployed = new Set(functions.filter((f) => list.stdout.includes(f)));
        }
        const missing = functions.filter((f) => !deployed.has(f));
        if (missing.length) problems.push(`not deployed: ${missing.join(", ")}`);
      }
    }
    return problems.length ? { ok: false, message: problems.join("; ") } : { ok: true, message: `Linked; migrations applied${functions.length ? ` and ${functions.length} function${functions.length === 1 ? "" : "s"} deployed` : ""}.` };
  },
};
