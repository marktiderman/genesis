// @feat:notifications
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

afterEach(cleanup);
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsProvider } from "../react/index";
import type { NotificationsClient } from "../supabase/index";
import { DeliveryLog, NotificationFeed, PreferencesMatrix } from "../web/index";
import { USER, registry } from "./fixtures";

function client(overrides: Partial<NotificationsClient> = {}): NotificationsClient {
  return {
    feed: vi.fn(async () => [
      { id: "n1", type: "chat.message", category: "messages", tenant_id: null, data: { sender_name: "Sam", preview: "Hi", conversation_id: "c1" }, thread_key: null, created_at: new Date().toISOString(), seen_at: null, read_at: null, archived_at: null },
    ]),
    unreadCount: vi.fn(async () => 1),
    mark: vi.fn(async () => 1),
    markAll: vi.fn(async () => 1),
    choices: vi.fn(async () => ({ messages: { email: false } })),
    setChoice: vi.fn(async () => ({ messages: { email: true } })),
    subscribe: vi.fn(() => () => {}),
    deliveryLog: vi.fn(async () => [
      { id: "d1", notification_id: "n1", tenant_id: null, type: "chat.message", channel: "email" as const, status: "skipped", attempts: 0, error: null, skip_reason: "read_in_app", recipient_masked: "s***@example.test", created_at: new Date().toISOString(), sent_at: null },
    ]),
    suppressions: vi.fn(async () => []),
    removeSuppression: vi.fn(async () => true),
    sendTest: vi.fn(async () => "n2"),
    ...overrides,
  };
}

function wrap(c: NotificationsClient, ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsProvider client={c} registry={registry} userId={USER}>
        {ui}
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

describe("web", () => {
  it("shows the feed and marks all read", async () => {
    const c = client();
    wrap(c, <NotificationFeed />);
    expect(await screen.findByText("Sam")).toBeTruthy();
    await act(async () => screen.getByTestId("notification-feed-mark-all").click());
    expect(c.markAll).toHaveBeenCalledWith("read");
  });

  it("draws the matrix with choices over defaults, critical rows locked", async () => {
    const c = client();
    wrap(c, <PreferencesMatrix />);
    const email = await screen.findByTestId("notification-preference-messages-email");
    await waitFor(() => expect(email.getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByTestId("notification-preference-security-email").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("notification-preference-forms-push")).toBeNull();
    await act(async () => email.click());
    expect(c.setChoice).toHaveBeenCalledWith("messages", "email", true);
  });

  it("lists deliveries with a masked address and no content", async () => {
    wrap(client(), <DeliveryLog />);
    expect(await screen.findByText("s***@example.test")).toBeTruthy();
    expect(screen.getByText("read_in_app")).toBeTruthy();
    expect(screen.queryByText("Hi")).toBeNull();
  });
});
