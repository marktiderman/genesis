/**
 * Where the push block keeps devices and preferences: migration 0005 of
 * @marktiderman/genesis-supabase, through the app's Supabase client and row
 * level security. `supabasePushBackend(supabase)` is the one to use; tests
 * (and an app with its own server) pass their own `PushBackend`.
 */

/** A person's notification preferences, as the screens edit them. */
export interface NotificationPreferences {
  /** Category id → on or off. A category not listed has its default (`NotificationCategory.defaultOn`). */
  categories: Record<string, boolean>;
  quietHours: QuietHours;
  /** Hide what a push says on the lock screen: the sender sends neutral text instead. */
  hidePreviews: boolean;
}

export interface QuietHours {
  enabled: boolean;
  /** Local time, `"HH:MM"` (24-hour). */
  start: string;
  /** Local time, `"HH:MM"`; before `start` means the quiet runs past midnight. */
  end: string;
  /** IANA time zone (`"Europe/London"`) the times are read in; required while enabled. */
  timeZone: string | null;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  categories: {},
  quietHours: { enabled: false, start: "22:00", end: "07:00", timeZone: null },
  hidePreviews: false,
};

export interface PushBackend {
  /** Keep this device's token against the signed-in person. */
  register(token: string, platform: string, appVersion: string | null): Promise<void>;
  /** Forget this device's token; works signed out (holding the token is the proof). */
  forget(token: string): Promise<void>;
  /** The signed-in person's preferences, or `null` before they have saved any. */
  loadPreferences(): Promise<NotificationPreferences | null>;
  savePreferences(userId: string, preferences: NotificationPreferences): Promise<void>;
}

type Result = { data: unknown; error: { message?: string; code?: string | null } | null };

/** The parts of a Supabase client the backend uses; a `SupabaseClient` fits, typed by your Database or not. */
export interface PushSupabaseLike {
  // Loose on purpose (as deleteMyAccount's): a client typed by an app's Database narrows `rpc`'s
  // and `from`'s arguments to its own functions and tables, which these names may not be in yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<Result>;
  from(table: string): unknown;
}

interface PreferencesQuery {
  select(columns: string): { maybeSingle(): PromiseLike<Result> };
  upsert(row: Record<string, unknown>, options: { onConflict: string }): { select(columns: string): PromiseLike<Result> };
}

/** A database refusal, with its SQLSTATE; the message is the database's own, never a token. */
export class PushBackendError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | null,
  ) {
    super(`${operation} failed${code ? ` (${code})` : ""}`);
    this.name = "PushBackendError";
  }
}

const COLUMNS = "categories, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone, hide_previews";

/** Postgres answers `time` as `"22:00:00"`. */
function clock(value: unknown, fallback: string): string {
  const match = typeof value === "string" ? /^(\d{2}):(\d{2})/.exec(value) : null;
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function fromRow(row: Record<string, unknown>): NotificationPreferences {
  const categories: Record<string, boolean> = {};
  const raw = row.categories;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, on] of Object.entries(raw as Record<string, unknown>)) if (typeof on === "boolean") categories[id] = on;
  }
  return {
    categories,
    quietHours: {
      enabled: row.quiet_hours_enabled === true,
      start: clock(row.quiet_hours_start, DEFAULT_PREFERENCES.quietHours.start),
      end: clock(row.quiet_hours_end, DEFAULT_PREFERENCES.quietHours.end),
      timeZone: typeof row.time_zone === "string" ? row.time_zone : null,
    },
    hidePreviews: row.hide_previews === true,
  };
}

/** Migration 0005's functions and tables, under the signed-in person's row level security. */
export function supabasePushBackend(client: PushSupabaseLike): PushBackend {
  const must = (operation: string, result: Result) => {
    if (result.error) throw new PushBackendError(operation, result.error.code ?? null);
    return result.data;
  };
  return {
    async register(token, platform, appVersion) {
      must("genesis_push_register", await client.rpc("genesis_push_register", { p_token: token, p_platform: platform, p_app_version: appVersion }));
    },
    async forget(token) {
      must("genesis_push_forget", await client.rpc("genesis_push_forget", { p_token: token }));
    },
    async loadPreferences() {
      const data = must("notification_preferences", await (client.from("notification_preferences") as PreferencesQuery).select(COLUMNS).maybeSingle());
      return data && typeof data === "object" ? fromRow(data as Record<string, unknown>) : null;
    },
    async savePreferences(userId, p) {
      const row = {
        user_id: userId,
        categories: p.categories,
        quiet_hours_enabled: p.quietHours.enabled,
        quiet_hours_start: p.quietHours.start,
        quiet_hours_end: p.quietHours.end,
        time_zone: p.quietHours.timeZone,
        hide_previews: p.hidePreviews,
      };
      const data = must("notification_preferences", await (client.from("notification_preferences") as PreferencesQuery).upsert(row, { onConflict: "user_id" }).select("user_id"));
      // Row level security turns a write it refuses into zero rows, not an error.
      if (!Array.isArray(data) || data.length !== 1) throw new PushBackendError("notification_preferences", "no_rows");
    },
  };
}
