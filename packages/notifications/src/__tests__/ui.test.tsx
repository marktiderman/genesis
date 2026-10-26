// @feat:notifications
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

afterEach(cleanup);
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsProvider, preferenceRows, useNotifications, usePreferences, useUnreadCount } from "../react/index";
import { choicesOf, type NotificationsClient } from "../supabase/index";
import { NOTIFICATIONS_FEED_LIMIT, notificationsPushBackend, pushOptionsFrom, useNotificationsFeedHeader } from "../native/index";
import { USER, registry } from "./fixtures";

function fakeClient(overrides: Partial<NotificationsClient> = {}): NotificationsClient & { fire: () => void } {
  let listener: (() => void) | null = null;
  return {
    feed: vi.fn(async () => [
      { id: "n1", type: "chat.message", category: "messages", tenant_id: null, data: { sender_name: "Sam", preview: "Hi", conversation_id: "c1" }, thread_key: "c1", created_at: new Date().toISOString(), seen_at: null, read_at: null, archived_at: null },
    ]),
    unreadCount: vi.fn(async () => 1),
    mark: vi.fn(async () => 1),
    markAll: vi.fn(async () => 1),
    choices: vi.fn(async () => ({})),
    setChoice: vi.fn(async () => ({})),
    subscribe: vi.fn((_u: string, on: () => void) => {
      listener = on;
      return () => {
        listener = null;
      };
    }),
    deliveryLog: vi.fn(async () => []),
    suppressions: vi.fn(async () => []),
    removeSuppression: vi.fn(async () => true),
    sendTest: vi.fn(async () => "n2"),
    fire: () => listener?.(),
    ...overrides,
  };
}

function Feed() {
  const { items, markRead } = useNotifications();
  const unread = useUnreadCount();
  return (
    <div>
      <span data-testid="unread">{unread}</span>
      {items.map((i) => (
        <button key={i.id} onClick={() => void markRead(i.id)}>
          {i.title}: {i.body} ({i.url})
        </button>
      ))}
    </div>
  );
}

describe("react hooks", () => {
  it("render the feed through the registry, mark read, and refetch on a broadcast", async () => {
    const client = fakeClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NotificationsProvider client={client} registry={registry} userId={USER}>
          <Feed />
        </NotificationsProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Sam: Hi (/messages/c1)")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("unread").textContent).toBe("1"));
    await act(async () => screen.getByText("Sam: Hi (/messages/c1)").click());
    expect(client.mark).toHaveBeenCalledWith(["n1"], "read");
    const before = (client.feed as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => client.fire());
    await waitFor(() => expect((client.feed as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before));
    expect(client.subscribe).toHaveBeenCalledWith(USER, expect.any(Function));
  });

  it("read nothing while signed out", async () => {
    const client = fakeClient();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <NotificationsProvider client={client} registry={registry} userId={null}>
          <Feed />
        </NotificationsProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(client.feed).not.toHaveBeenCalled();
    expect(client.subscribe).not.toHaveBeenCalled();
  });

  it("read 0005's category switch as push and email off, where no channel was chosen", () => {
    expect(choicesOf({ channels: { messages: { push: true } }, categories: { messages: false, forms: true } })).toEqual({ messages: { push: true, email: false } });
    expect(choicesOf(null)).toEqual({});
  });

  it("after a save, read choices back through choices() (0005's switches folded in), not the raw row", async () => {
    // forms was off under 0005's switch; the save of messages returns only the channels column.
    const choices = vi.fn(async () => ({ forms: { email: false } }));
    const client = fakeClient({ choices, setChoice: vi.fn(async () => ({ messages: { email: false } })) });
    let api: ReturnType<typeof usePreferences> | null = null;
    function Prefs() {
      api = usePreferences();
      const forms = api.rows.find((r) => r.id === "forms");
      return <span data-testid="forms">{String(forms?.values.email)}</span>;
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NotificationsProvider client={client} registry={registry} userId={USER}>
          <Prefs />
        </NotificationsProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("forms").textContent).toBe("false"));
    await act(async () => api!.set("messages", "email", false));
    await waitFor(() => expect(choices).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("forms").textContent).toBe("false");
  });

  it("apply choices over defaults; a critical row stays as defaulted", () => {
    const rows = preferenceRows(registry, { messages: { email: false }, security: { email: false } });
    expect(rows.find((r) => r.id === "messages")?.values).toEqual({ in_app: true, push: true, email: false });
    expect(rows.find((r) => r.id === "security")?.values).toEqual({ in_app: true, email: true });
  });
});

describe("native", () => {
  it("the feed header reads the feed's own query, not a second one", async () => {
    const client = fakeClient();
    function Screen() {
      useNotificationsFeedHeader({ headerTitle: "Notifications" });
      const { items } = useNotifications({ limit: NOTIFICATIONS_FEED_LIMIT });
      return <span>{items.length}</span>;
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NotificationsProvider client={client} registry={registry} userId={USER}>
          <Screen />
        </NotificationsProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.feed).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(client.feed).toHaveBeenCalledTimes(1);
  });

  it("keeps a switch for a category no notifier type pushes in (chat's) in 0005's categories, and still saves the rest", async () => {
    const rpc = vi.fn(async (_fn: string, args?: { p_category?: string }) =>
      args?.p_category === "chat-messages" ? { data: null, error: { code: "42704" } } : { data: null, error: null },
    );
    const upsert = vi.fn(() => ({ select: async () => ({ data: [{ user_id: USER }], error: null }) }));
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { channels: {}, categories: { news: false }, quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00", time_zone: null, hide_previews: false }, error: null }) }) }),
      upsert,
    }));
    const backend = notificationsPushBackend({ rpc, from });
    const loaded = await backend.loadPreferences(USER);
    await backend.savePreferences(USER, { ...loaded!, categories: { ...loaded!.categories, "chat-messages": false }, quietHours: { ...loaded!.quietHours, enabled: true, timeZone: "UTC" } });
    const row = (upsert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row).toMatchObject({ quiet_hours_enabled: true, categories: { news: false, "chat-messages": false } });
    await expect(
      notificationsPushBackend({ rpc: async () => ({ data: null, error: { code: "42501" } }), from }).savePreferences(USER, { ...loaded!, categories: { forms: false } }),
    ).rejects.toThrow(/42501/);
    // A critical category can't be turned off (22023): that is thrown, never kept as a switch.
    await expect(
      notificationsPushBackend({ rpc: async () => ({ data: null, error: { code: "22023" } }), from }).savePreferences(USER, { ...loaded!, categories: { security: false } }),
    ).rejects.toThrow(/22023/);
  });

  it("gives the push block its categories and device categories", () => {
    const o = pushOptionsFrom(registry);
    expect(o.categories?.map((c) => c.id)).toEqual(["messages", "forms", "security", "genesis"]);
    expect(o.deviceCategories?.[0]?.identifier).toBe("message");
  });

  it("registers with the install id, and saves only the push switches that changed, one cell at a time", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const upsert = vi.fn(() => ({ select: async () => ({ data: [{ user_id: USER }], error: null }) }));
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { channels: { messages: { push: true, email: false } }, quiet_hours_enabled: false, quiet_hours_start: "22:00:00", quiet_hours_end: "07:00:00", time_zone: null, hide_previews: true }, error: null }) }) }),
      upsert,
    }));
    const backend = notificationsPushBackend({ rpc, from });
    expect(backend.usesInstallationId).toBe(true);
    await backend.register("ExponentPushToken[a]", "ios", "1.0", "11111111-1111-4111-8111-111111111111");
    expect(rpc).toHaveBeenCalledWith("genesis_push_register", { p_token: "ExponentPushToken[a]", p_platform: "ios", p_app_version: "1.0", p_installation_id: "11111111-1111-4111-8111-111111111111" });
    const loaded = await backend.loadPreferences(USER);
    expect(loaded).toMatchObject({ categories: { messages: true }, hidePreviews: true, quietHours: { start: "22:00", end: "07:00" } });
    rpc.mockClear();
    await backend.savePreferences(USER, { ...loaded!, categories: { messages: true, forms: false } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("genesis_notifications_set_preference", { p_category: "forms", p_channel: "push", p_on: false });
    // The row write carries no channels or categories, so it can't overwrite the matrix.
    expect(Object.keys((upsert.mock.calls[0] as unknown as [Record<string, unknown>])[0])).not.toContain("channels");
    expect(Object.keys((upsert.mock.calls[0] as unknown as [Record<string, unknown>])[0])).not.toContain("categories");
  });
});
