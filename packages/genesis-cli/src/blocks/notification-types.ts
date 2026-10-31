/**
 * Notification types, mirrored at migration time. genesis-notifications keeps an app's types in
 * `notification_types`, written from its `defineNotifications` registry by
 * `genesis_notifications_sync_types`. Synced on deploy alone, a trigger a migration adds can queue a
 * type the database doesn't have yet (`genesis_notify: unknown or retired type`). So when the app
 * has the notifications block, `genesis migrate` loads the registry and, when its types differ from
 * the newest types migration in the folder, writes a new one that runs the same sync: the types are
 * in the database as soon as the migrations are. Deploy-time sync stays as it is, and agrees.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { createJiti } from "jiti";
import { MIGRATIONS_DIR, nextTimestamps, readAppMigrations } from "./migrations.js";

export const NOTIFICATIONS_PACKAGE = "@marktiderman/genesis-notifications";
/** Where an app's `defineNotifications` registry usually is, first match wins. `--notifications` overrides. */
export const DEFAULT_NOTIFICATION_REGISTRIES = [
  "src/notifications.ts",
  "src/lib/notifications.ts",
  "src/notifications/index.ts",
  "lib/notifications.ts",
  "notifications.ts",
];
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

/** The migration's SQL for these rows. Deterministic: rows by key, keys sorted. */
export function notificationTypesSql(rows: ReadonlyArray<{ key: string }>, registryFile: string): string {
  const ordered = [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(sorted);
  const json = JSON.stringify(ordered, null, 2).replace(/'/g, "''");
  return [
    `-- genesis-notification-types: ${registryFile}`,
    "-- Written by `genesis migrate` from the app's defineNotifications registry, so the types are in the",
    "-- database as soon as the migrations are (a trigger that queues one never meets an unknown type).",
    "-- Types left out are retired, never deleted. Don't edit it: change the registry and run genesis migrate.",
    `select public.genesis_notifications_sync_types('${json}'::jsonb);`,
    "",
  ].join("\n");
}

export interface NotificationTypesPlan {
  /** The registry file read, relative to the app. */
  registry?: string;
  /** The migration to create, when the registry's types differ from the newest one in the folder. */
  create?: { path: string; content: string };
  warnings: string[];
}

/**
 * Plan the types migration. `pending` are migration file names about to be created in the same run
 * (the types migration sorts after them, so the sync function exists before it runs).
 */
export async function planNotificationTypes(root: string, options: { registry?: string; now: Date; pending?: string[] }): Promise<NotificationTypesPlan> {
  const warnings: string[] = [];
  const file = options.registry ?? DEFAULT_NOTIFICATION_REGISTRIES.find((p) => existsSync(path.join(root, p)));
  if (!file || !existsSync(path.join(root, file))) {
    warnings.push(
      `The notifications block is installed but no defineNotifications registry was found (looked for ${options.registry ?? DEFAULT_NOTIFICATION_REGISTRIES.join(", ")}); ` +
        "pass --notifications <file> so genesis migrate can mirror its types at migration time.",
    );
    return { warnings };
  }
  const registry = file.split(path.sep).join("/");
  let mod: Record<string, unknown>;
  try {
    const jiti = createJiti(path.join(root, "package.json"), { moduleCache: false });
    mod = (await jiti.import(path.join(root, file))) as Record<string, unknown>;
  } catch (err) {
    warnings.push(`${registry}: couldn't load it to mirror the notification types (${err instanceof Error ? err.message : String(err)}).`);
    return { registry, warnings };
  }
  const found = isRegistry(mod.notifications) ? mod.notifications : isRegistry(mod.default) ? mod.default : Object.values(mod).find(isRegistry);
  if (!found) {
    warnings.push(`${registry} exports no defineNotifications registry (export it as \`notifications\`); the notification types weren't mirrored.`);
    return { registry, warnings };
  }
  const content = notificationTypesSql(found.toTypeRows(), registry);
  const app = readAppMigrations(root);
  const latest = app
    .filter((m) => m.name.endsWith(`_${TYPES_STEM}.sql`))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .pop();
  if (latest && latest.content.replace(/\r\n/g, "\n") === content) return { registry, warnings };
  const [stamp] = nextTimestamps([...app.map((m) => m.name), ...(options.pending ?? [])], options.now, 1);
  return { registry, create: { path: `${MIGRATIONS_DIR}/${stamp}_${TYPES_STEM}.sql`, content }, warnings };
}
