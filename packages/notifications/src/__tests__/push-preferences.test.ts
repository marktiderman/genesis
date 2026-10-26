// @feat:notifications
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createPreferencesStore, type PushBackend } from "@marktiderman/genesis-native/push";
import { notificationsPushBackend, notificationsPushPreferences } from "../native/index";
import { USER } from "./fixtures";

type Result = { data: unknown; error: { code?: string | null } | null };

/** A Supabase client over one notification_preferences row, as row level security shows it to USER. */
function fakeSupabase(initial: Record<string, unknown> | null, options: { refuseWrites?: boolean } = {}) {
  let row = initial;
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>): Promise<Result> => {
    if (fn !== "genesis_notifications_set_preference") return { data: null, error: null };
    const channels = { ...((row?.channels as Record<string, Record<string, boolean>>) ?? {}) };
    channels[args!.p_category as string] = { ...channels[args!.p_category as string], [args!.p_channel as string]: args!.p_on as boolean };
    row = { ...row, channels };
    return { data: channels, error: null };
  });
  const upsert = vi.fn((values: Record<string, unknown>) => ({
    select: async (): Promise<Result> => {
      if (options.refuseWrites) return { data: [], error: null };
      row = { ...row, ...values };
      return { data: [{ user_id: USER }], error: null };
    },
  }));
  const from = vi.fn(() => ({
    select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async (): Promise<Result> => ({ data: id === USER ? row : null, error: null }) }) }),
    upsert,
  }));
  return { client: { rpc, from }, rpc, upsert, row: () => row };
}

const ROW = {
  channels: { forms: { push: false, email: true } },
  categories: {},
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00:00",
  quiet_hours_end: "07:00:00",
  time_zone: null,
  hide_previews: false,
};

describe("notificationsPushPreferences", () => {
  it("is the preferences half only: an app keeps its own register and forget", () => {
    const prefs = notificationsPushPreferences(fakeSupabase(null).client);
    expect(Object.keys(prefs).sort()).toEqual(["loadPreferences", "savePreferences"]);
  });

  it("answers null before the person saved anything, then reads the row as the push block's preferences", async () => {
    expect(await notificationsPushPreferences(fakeSupabase(null).client).loadPreferences(USER)).toBeNull();
    const loaded = await notificationsPushPreferences(fakeSupabase(ROW).client).loadPreferences(USER);
    expect(loaded).toEqual({ categories: { forms: false }, quietHours: { enabled: false, start: "22:00", end: "07:00", timeZone: null }, hidePreviews: false });
  });

  it("drives the push block's preferences store beside an app's own device functions", async () => {
    const db = fakeSupabase(ROW);
    const register = vi.fn(async () => undefined);
    const forget = vi.fn(async () => undefined);
    const backend: PushBackend = { register, forget, ...notificationsPushPreferences(db.client) };
    const store = createPreferencesStore({ backend, categories: [{ id: "forms", title: "Forms" }, { id: "messages", title: "Messages" }] });

    await store.load(USER);
    expect(store.getState().status).toBe("ready");
    expect(store.isOn("forms")).toBe(false);
    expect(store.isOn("messages")).toBe(true);

    expect(await store.update((p) => ({ ...p, categories: { ...p.categories, forms: true }, quietHours: { enabled: true, start: "21:30", end: "06:45", timeZone: "Europe/London" } }))).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith("genesis_notifications_set_preference", { p_category: "forms", p_channel: "push", p_on: true });
    expect(db.row()).toMatchObject({ quiet_hours_enabled: true, quiet_hours_start: "21:30", quiet_hours_end: "06:45", time_zone: "Europe/London" });
    // Preferences never touch the device.
    expect(register).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
  });

  it("a save row level security refuses is put back in the store, with the error", async () => {
    const db = fakeSupabase(ROW, { refuseWrites: true });
    const store = createPreferencesStore({ backend: { register: vi.fn(), forget: vi.fn(), ...notificationsPushPreferences(db.client) }, categories: [] });
    await store.load(USER);
    expect(await store.update((p) => ({ ...p, hidePreviews: true }))).toBe(false);
    expect(store.getState().preferences.hidePreviews).toBe(false);
    expect(store.getState().error?.message).toMatch(/no_rows/);
  });

  it("notificationsPushBackend keeps the same preferences, with its own register", async () => {
    const db = fakeSupabase(ROW);
    const backend = notificationsPushBackend(db.client);
    expect(backend.usesInstallationId).toBe(true);
    expect(await backend.loadPreferences(USER)).toMatchObject({ categories: { forms: false } });
  });
});
