// @feat:push
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createSessionStore, SessionProvider } from "../../auth";
import {
  createPush,
  NotificationSettings,
  PushRoot,
  isQuietAt,
  statusOf,
  supabasePushBackend,
  type PushBlock,
  type QuietHoursPartProps,
} from "../../push";
import { fakeSupabase, memoryStorage, settle } from "../fakes";
import { fakeBackend, fakeNotifications, permission, prefs } from "./fakes";

afterEach(() => vi.restoreAllMocks());

async function mount(ui: (block: PushBlock) => React.ReactNode, options: { status?: typeof permission.granted; saved?: ReturnType<typeof prefs> | null; openSettings?: () => void } = {}) {
  const n = fakeNotifications({ status: options.status ?? permission.granted });
  const b = fakeBackend(options.saved ?? null);
  const block = createPush({
    notifications: n.module,
    platform: "ios",
    projectId: "p",
    backend: b.backend,
    storage: memoryStorage(),
    openSettings: options.openSettings,
    categories: [{ id: "messages", title: "Messages", description: "Replies and mentions" }, { id: "digest", title: "Weekly digest", defaultOn: false }],
  });
  const session = createSessionStore(fakeSupabase({ user: { id: "u1" } }).client);
  await session.load();
  render(
    <SessionProvider store={session}>
      <PushRoot block={block}>{ui(block)}</PushRoot>
    </SessionProvider>,
  );
  await act(settle);
  return { n, b, block };
}

const sw = (id: string) => screen.getByTestId(`notification-settings-${id}-switch`) as HTMLInputElement;

describe("NotificationSettings", () => {
  it("shows a switch per category with its default, and saves a change at once", async () => {
    const { b } = await mount(() => <NotificationSettings />);
    expect(sw("category-messages").checked).toBe(true);
    expect(sw("category-digest").checked).toBe(false);
    fireEvent.click(sw("category-digest"));
    await act(settle);
    expect(sw("category-digest").checked).toBe(true);
    expect(b.backend.savePreferences).toHaveBeenCalledWith("u1", expect.objectContaining({ categories: { digest: true } }));
  });

  it("reads the saved preferences", async () => {
    await mount(() => <NotificationSettings />, { saved: prefs({ categories: { messages: false }, hidePreviews: true }) });
    expect(sw("category-messages").checked).toBe(false);
    expect(sw("previews").checked).toBe(false);
  });

  it("puts a change back, and says so, when the save fails", async () => {
    const { b } = await mount(() => <NotificationSettings />);
    b.backend.savePreferences.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(sw("previews"));
    await act(settle);
    expect(sw("previews").checked).toBe(true);
    expect(screen.getByText(/Couldn't save that change/)).toBeTruthy();
  });

  it("turning quiet hours on fills in this phone's time zone and shows the from, to and zone rows", async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { b } = await mount(() => <NotificationSettings />);
    expect(screen.queryByTestId("notification-settings-quiet-from")).toBeNull();
    fireEvent.click(sw("quiet-hours"));
    await act(settle);
    expect(b.backend.savePreferences).toHaveBeenLastCalledWith("u1", expect.objectContaining({ quietHours: { enabled: true, start: "22:00", end: "07:00", timeZone: zone } }));
    expect(screen.getByTestId("notification-settings-quiet-from")).toBeTruthy();
    expect(screen.getByTestId("notification-settings-time-zone").textContent).toContain(zone);
  });

  it("hiding previews saves hide_previews", async () => {
    const { b } = await mount(() => <NotificationSettings />);
    fireEvent.click(sw("previews"));
    await act(settle);
    expect(b.backend.savePreferences).toHaveBeenLastCalledWith("u1", expect.objectContaining({ hidePreviews: true }));
  });

  it("offers Turn on while the system can ask (a tap asks straight away), and Open Settings once it can't", async () => {
    const asked = await mount(() => <NotificationSettings />, { status: permission.undetermined });
    expect(screen.getByTestId("notification-settings-allow").textContent).toContain("Turn on");
    fireEvent.click(screen.getByTestId("notification-settings-allow"));
    await act(settle);
    expect(asked.n.module.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("opens Settings when notifications are off there", async () => {
    const openSettings = vi.fn();
    await mount(() => <NotificationSettings />, { status: permission.denied, openSettings });
    expect(screen.getByTestId("notification-settings-allow").textContent).toContain("Open Settings");
    fireEvent.click(screen.getByTestId("notification-settings-allow"));
    await act(settle);
    expect(openSettings).toHaveBeenCalled();
  });

  it("drops a part with null and replaces one inside its section with a slot, which gets the part's props", async () => {
    let got: QuietHoursPartProps | null = null;
    function MyQuietHours(props: QuietHoursPartProps) {
      got = props;
      return <span data-testid="my-quiet-hours">{props.start}</span>;
    }
    await mount(() => <NotificationSettings slots={{ privacy: null, quietHours: MyQuietHours }} slotProps={{ quietHours: { start: "21:00" } }} />);
    expect(screen.queryByTestId("notification-settings-section-privacy")).toBeNull();
    expect(screen.getByTestId("notification-settings-section-quiet-hours-group").textContent).toBe("21:00");
    expect(got!.setEnabled).toBeTypeOf("function");
  });
});

describe("push helpers", () => {
  it("reads Expo's permission answer as one status", () => {
    expect(statusOf(permission.undetermined)).toBe("undetermined");
    expect(statusOf(permission.granted)).toBe("granted");
    expect(statusOf(permission.provisional)).toBe("provisional");
    expect(statusOf(permission.denied)).toBe("denied");
    // Android after one "Don't allow": the system can still ask once more.
    expect(statusOf({ status: "denied", granted: false, canAskAgain: true })).toBe("undetermined");
  });

  it("places quiet hours in the saved time zone, the same rule as the server", () => {
    const ny = { enabled: true, start: "22:00", end: "07:00", timeZone: "America/New_York" };
    expect(isQuietAt(ny, new Date("2026-01-15T04:00:00Z"))).toBe(true); // 23:00 EST
    expect(isQuietAt(ny, new Date("2026-01-15T12:00:00Z"))).toBe(false); // 07:00 EST, end exclusive
    expect(isQuietAt(ny, new Date("2026-01-15T03:00:00Z"))).toBe(true); // 22:00 EST, start inclusive
    expect(isQuietAt({ ...ny, end: "22:00" }, new Date("2026-01-15T04:00:00Z"))).toBe(false); // start = end: none
    expect(isQuietAt({ ...ny, timeZone: "Mars/Olympus" }, new Date("2026-01-15T04:00:00Z"))).toBe(false); // unknown zone: never quiet
    expect(isQuietAt({ ...ny, enabled: false }, new Date("2026-01-15T04:00:00Z"))).toBe(false);
  });

  it("supabasePushBackend calls migration 0005 and treats a write row level security refused as a failure", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const row = { categories: { messages: false, bad: "x" }, quiet_hours_enabled: true, quiet_hours_start: "21:30:00", quiet_hours_end: "06:00:00", time_zone: "Europe/London", hide_previews: true };
    const upsertSelect = vi.fn(async () => ({ data: [], error: null }));
    const upsert = vi.fn(() => ({ select: upsertSelect }));
    const client = { rpc, from: vi.fn(() => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }), upsert })) };
    const backend = supabasePushBackend(client);
    await backend.register("ExponentPushToken[a]", "ios", "1.0");
    expect(rpc).toHaveBeenCalledWith("genesis_push_register", { p_token: "ExponentPushToken[a]", p_platform: "ios", p_app_version: "1.0" });
    await backend.forget("ExponentPushToken[a]");
    expect(rpc).toHaveBeenLastCalledWith("genesis_push_forget", { p_token: "ExponentPushToken[a]" });
    expect(await backend.loadPreferences()).toEqual({
      categories: { messages: false },
      quietHours: { enabled: true, start: "21:30", end: "06:00", timeZone: "Europe/London" },
      hidePreviews: true,
    });
    await expect(backend.savePreferences("u1", prefs())).rejects.toThrow(/no_rows/);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", quiet_hours_start: "22:00" }), { onConflict: "user_id" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "nope" } as never });
    await expect(backend.register("x", "ios", null)).rejects.toThrow("genesis_push_register failed (42501)");
  });
});
