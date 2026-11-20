/**
 * `supabase.link`: link the app to its Supabase project, push the migrations, deploy the functions.
 * Verified when no migration is pending and every local function is deployed.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { defineSetupStep } from "@marktiderman/genesis-config/setup";
import { TOOL_AUTH_ENV } from "../../exec/run.js";
import { supabaseLinked } from "../../exec/secret-stores.js";
import type { PlannedCommand } from "../../fix/types.js";
import { OFFLINE, printable, type StepContext, type StepRunner } from "./framework.js";

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

/** The app's migration files, sorted, each with the sha256 of its content (the first 12 hex digits). */
export function localMigrations(root: string): Array<{ file: string; hash: string }> {
  const dir = path.join(root, "supabase", "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && statSync(path.join(dir, f)).isFile())
    .sort()
    .map((file) => ({ file, hash: createHash("sha256").update(readFileSync(path.join(dir, file))).digest("hex").slice(0, 12) }));
}

const hasMigrations = (root: string) => localMigrations(root).length > 0;

/** The project ref the app is linked to (supabase/.temp/project-ref), or null. */
export function linkedRef(root: string): string | null {
  const file = path.join(root, "supabase", ".temp", "project-ref");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").trim() || null;
}

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
          if (ref) lines.push(`${printable(ref)}  ${printable(r.name)}${typeof r.region === "string" ? ` (${printable(r.region)})` : ""}`);
        }
        if (!rows.length) lines.push("No projects yet: make one in the dashboard.");
      } catch {
        lines.push("The project list couldn't be read.");
      }
    }
    const migrations = localMigrations(ctx.root);
    if (migrations.length && supabaseLinked(ctx.root)) {
      const dry = await supabase(ctx, ["db", "push", "--dry-run"]).catch((err: Error) => ({ code: 1, stdout: "", stderr: err.message }));
      lines.push("", `supabase db push --dry-run (against ${printable(linkedRef(ctx.root))}, the project linked now):`, ...printable(`${dry.stdout}${dry.stderr}`.trim()).split("\n").slice(-20));
    } else if (migrations.length) {
      // A first link: supabase can't compare with a database it isn't linked to yet.
      lines.push("", `No dry run: the app isn't linked yet, so supabase can't say which of its ${migrations.length} migration${migrations.length === 1 ? "" : "s"} the database already has. db push applies each one it doesn't have, from this list (the plan names them too):`, ...migrations.map((m) => `  ${m.file}`));
    }
    return lines;
  },
  plan(ctx) {
    const ref = ctx.fields.projectRef!;
    const functions = localFunctions(ctx.root);
    const commands: PlannedCommand[] = [{ tool: "supabase", args: ["link", "--project-ref", ref], why: `links the app to the project ${ref}` }];
    // Each migration by name and content hash: the plan's hash covers them, so an edit or a new file makes it stale.
    const migrations = localMigrations(ctx.root);
    if (migrations.length) {
      const first = !supabaseLinked(ctx.root) || linkedRef(ctx.root) !== ref;
      commands.push({
        tool: "supabase",
        args: ["db", "push", "--yes"],
        why: `applies to ${ref} whichever of these migrations it doesn't have yet (${first ? "no dry run: the app isn't linked to it yet" : "the dry run above lists them"}): ${migrations.map((m) => `${m.file} (sha256 ${m.hash})`).join(", ")}`,
      });
    }
    for (const name of functions) commands.push({ tool: "supabase", args: ["functions", "deploy", name], why: `deploys the Edge Function ${name}` });
    return { summary: `links Supabase project ${ref}${hasMigrations(ctx.root) ? ", pushes the migrations" : ""}${functions.length ? ` and deploys ${functions.length} function${functions.length === 1 ? "" : "s"}` : ""}`, commands };
  },
  async verify(ctx) {
    const linked = linkedRef(ctx.root);
    if (!linked) return { ok: false, message: "The app isn't linked to a Supabase project yet." };
    const wanted = ctx.fields.projectRef;
    if (wanted && linked !== wanted) return { ok: false, message: `The app is linked to ${printable(linked)}, not ${wanted}: run the step again to link ${wanted}.` };
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
