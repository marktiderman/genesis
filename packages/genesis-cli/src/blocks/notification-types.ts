/**
 * Notification types, mirrored at migration time. genesis-notifications keeps an app's types in
 * `notification_types`, written from its `defineNotifications` registry by
 * `genesis_notifications_sync_types` on deploy. Synced on deploy alone, a trigger can queue a type
 * the database doesn't have yet (`genesis_notify: unknown or retired type`). So when the app names
 * its registry (`--notifications <file>` or `notifications.registry` in genesis.config.json),
 * `genesis migrate` loads it and, when its types differ from the newest types migration in the
 * folder, writes a new one that adds and updates them. The types are in place once every migration
 * has run. It never retires a type: each migration is a snapshot of one branch's registry, and two
 * branches merged would retire each other's types. Retiring stays with the deploy-time sync.
 *
 * Loading the registry runs app code, so it is opt-in, never done on a dry run, and the registry
 * module must have no side effects (no network, no database, no writes) when imported.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { createJiti } from "jiti";
import { MIGRATIONS_DIR, nextTimestamps, readAppMigrations } from "./migrations.js";

export const NOTIFICATIONS_PACKAGE = "@marktiderman/genesis-notifications";
/** The stem of every types migration this writes. */
export const TYPES_STEM = "genesis_notification_types";

interface Registry {
  toTypeRows(): Array<Record<string, unknown> & { key: string }>;
}
const isRegistry = (v: unknown): v is Registry => !!v && typeof v === "object" && typeof (v as Registry).toTypeRows === "function";

/** A type row with its keys in a fixed order, so the same registry is the same bytes. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sorted((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Characters JSON may hold that SQL or a reader shouldn't meet raw: escaped as JSON `\\u` escapes, which jsonb reads back. */
const UNSAFE: Record<string, string> = { "'": "\\u0027", "<": "\\u003C", ">": "\\u003E", "\u2028": "\\u2028", "\u2029": "\\u2029", "\0": "\\u0000" };

/**
 * The rows as the SQL literal holds them: by key, keys sorted. A quote is written as the JSON escape
 * `\\u0027`, never raw, so nothing in a registry string can end the literal.
 */
function payload(rows: ReadonlyArray<{ key: string }>): string {
  const ordered = [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(sorted);
  return JSON.stringify(ordered, null, 2).replace(/['<>\u2028\u2029\0]/g, (c) => UNSAFE[c]!);
}

const PAYLOAD = /from jsonb_to_recordset\('([^']*)'::jsonb\)/;
/** The JSON a types migration carries, or null: what two of them are compared by (not the header). */
export const payloadOf = (sql: string): string | null => PAYLOAD.exec(sql.replace(/\r\n/g, "\n"))?.[1] ?? null;

/**
 * The migration's SQL for these rows: an upsert into `notification_types` with the same columns and
 * defaults as `genesis_notifications_sync_types`, minus its retiring of types left out.
 */
export function notificationTypesSql(rows: ReadonlyArray<{ key: string }>, registryFile: string): string {
  return [
    `-- genesis-notification-types: ${registryFile.replace(/[\r\n]+/g, " ")}`,
    "-- Written by `genesis migrate` from the app's defineNotifications registry, so the types are in place",
    "-- once the migrations have run, before any deploy-time sync. It adds and updates types and never",
    "-- retires one (syncNotificationTypes on deploy does). Don't edit it: change the registry and run genesis migrate.",
    "insert into public.notification_types as t (key, category, channels, critical, transactional, email_delay_seconds, secret_link, push_privacy, ios_category, retired_at, updated_at)",
    "select x.key, x.category, x.channels, coalesce(x.critical, false), coalesce(x.transactional, false), coalesce(x.email_delay_seconds, 0),",
    "       coalesce(x.secret_link, false), coalesce(x.push_privacy, 'default'), x.ios_category, null, now()",
    `from jsonb_to_recordset('${payload(rows)}'::jsonb)`,
    "  as x (key text, category text, channels jsonb, critical boolean, transactional boolean, email_delay_seconds integer, secret_link boolean, push_privacy text, ios_category text)",
    "on conflict (key) do update",
    "  set category = excluded.category, channels = excluded.channels, critical = excluded.critical, transactional = excluded.transactional,",
    "      email_delay_seconds = excluded.email_delay_seconds, secret_link = excluded.secret_link, push_privacy = excluded.push_privacy,",
    "      ios_category = excluded.ios_category, retired_at = null, updated_at = now();",
    "",
  ].join("\n");
}

/** `notifications.registry` from the app's genesis.config.json, or undefined. */
export function configuredRegistry(root: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")) as { notifications?: { registry?: unknown } };
    return typeof raw.notifications?.registry === "string" ? raw.notifications.registry : undefined;
  } catch {
    return undefined;
  }
}

export interface NotificationTypesPlan {
  /** The registry file read, as given. */
  registry?: string;
  /** The migration to create, when the registry's types differ from the newest one in the folder. */
  create?: { path: string; content: string };
  warnings: string[];
}

/**
 * Plan the types migration. `registry` is `--notifications`; without it, genesis.config.json's
 * `notifications.registry`. A relative path is resolved against the app's root. `pending` are
 * migration file names about to be created in the same run (the types migration sorts after them).
 */
export async function planNotificationTypes(
  root: string,
  options: { registry?: string; now: Date; pending?: string[]; dryRun?: boolean },
): Promise<NotificationTypesPlan> {
  const warnings: string[] = [];
  const file = options.registry ?? configuredRegistry(root);
  if (!file) {
    warnings.push(
      "Notification types: not checked. Name the defineNotifications registry (--notifications <file>, or notifications.registry in genesis.config.json) so genesis migrate mirrors its types at migration time.",
    );
    return { warnings };
  }
  if (options.dryRun) {
    warnings.push(`Notification types: not checked on a dry run (loading ${file} runs app code).`);
    return { registry: file, warnings };
  }
  const absolute = path.resolve(root, file);
  if (!existsSync(absolute)) {
    warnings.push(`Notification types: ${file} doesn't exist (a relative path is resolved against the app's root, ${root}).`);
    return { registry: file, warnings };
  }
  let mod: Record<string, unknown>;
  try {
    const jiti = createJiti(path.join(root, "package.json"), { moduleCache: false });
    mod = (await jiti.import(absolute)) as Record<string, unknown>;
  } catch (err) {
    warnings.push(`Notification types: couldn't load ${file} (${err instanceof Error ? err.message : String(err)}).`);
    return { registry: file, warnings };
  }
  const found = isRegistry(mod.notifications) ? mod.notifications : isRegistry(mod.default) ? mod.default : Object.values(mod).find(isRegistry);
  if (!found) {
    warnings.push(`Notification types: ${file} exports no defineNotifications registry (export it as \`notifications\`).`);
    return { registry: file, warnings };
  }
  const shown = path.isAbsolute(file) ? path.relative(root, absolute) : file;
  const content = notificationTypesSql(found.toTypeRows(), shown.split(path.sep).join("/"));
  const app = readAppMigrations(root);
  const latest = app
    .filter((m) => m.name.endsWith(`_${TYPES_STEM}.sql`))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .pop();
  if (latest && payloadOf(latest.content) === payloadOf(content)) return { registry: file, warnings };
  let stamp: string;
  try {
    [stamp] = nextTimestamps([...app.map((m) => m.name), ...(options.pending ?? [])], options.now, 1) as [string];
  } catch (err) {
    warnings.push(`Notification types: no migration written (${err instanceof Error ? err.message : String(err)}).`);
    return { registry: file, warnings };
  }
  return { registry: file, create: { path: `${MIGRATIONS_DIR}/${stamp}_${TYPES_STEM}.sql`, content }, warnings };
}
