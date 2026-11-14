// @feat:support-helpdesk
// The messenger's hooks on the phone.
import type { ReactNode } from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadPage } from "@marktiderman/genesis-ui-native/layouts";
import { createSupport, HelpArticleBody, SupportProvider, useHelpArticle, useHelpCenter, useMessengerHome, useStartConversation, useSupportThread } from "../native";
import { fakeSupabase, type Call } from "./fake-supabase";

const ARTICLE = { id: "a1", collection_id: null, slug: "reset", title: "Reset your password", summary: "Getting in", status: "published", published_at: "x", updated_at: "x" };

const answers = (fn: string): { data: unknown; error: null } => {
  if (fn === "support_help_collections") return { data: [{ id: "col", title: "Billing", description: null, position_in_list: 0 }], error: null };
  if (fn === "support_help_articles") return { data: [ARTICLE], error: null };
  if (fn === "support_help_article") return { data: [{ ...ARTICLE, body: "Open Settings.\n\nPress Reset." }], error: null };
  if (fn === "support_search_articles") return { data: [{ ...ARTICLE, rank: 1 }], error: null };
  if (fn === "support_ai_enabled") return { data: false, error: null };
  return { data: null, error: null };
};

function harness(extra: Partial<Parameters<typeof createSupport>[0]> = {}, respond?: (call: Call) => { data: unknown; error: null } | undefined) {
  const fake = fakeSupabase({ rpc: answers, ...(respond ? { respond } : {}) });
  const navigate = vi.fn();
  const block = createSupport({ supabase: fake.client, navigate, platform: "ios", basePath: "/s", tenantId: "ta", ...extra });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SupportProvider block={block}>{children}</SupportProvider>
    </QueryClientProvider>
  );
  return { fake, navigate, wrapper };
}

describe("the messenger on the phone", () => {
  it("Home lists the latest conversation and articles in the tenant", async () => {
    const { wrapper, navigate, fake } = harness({}, (call) =>
      call.table === "support_reports" ? { data: [{ id: "t1", type: "question", title: null, message: "Where is it?", status: "open", created_at: "x", updated_at: "x" }], error: null } : undefined,
    );
    const { result } = renderHook(() => useMessengerHome({ greeting: "Hi" }), { wrapper });
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.items[0]?.title).toBe("Where is it?");
    result.current.items[0]?.onPress?.();
    expect(navigate).toHaveBeenCalledWith("/s/t1");
    result.current.items[1]?.onPress?.();
    expect(navigate).toHaveBeenCalledWith("/s/help/reset");
    expect(fake.rpcs.find((r) => r.fn === "support_help_articles")?.args).toMatchObject({ tenant: "ta" });
  });

  it("the help center lists collections and articles, and searches", async () => {
    const { wrapper, fake } = harness();
    const { result } = renderHook(() => useHelpCenter({ initialQuery: "reset" }), { wrapper });
    await waitFor(() => expect(result.current.items.map((i) => i.title)).toEqual(["Reset your password"]));
    expect(fake.rpcs.find((r) => r.fn === "support_search_articles")?.args).toMatchObject({ tenant: "ta", query: "reset" });
    const browse = renderHook(() => useHelpCenter(), { wrapper });
    await waitFor(() => expect(browse.result.current.items.map((i) => i.title)).toEqual(["Billing", "Reset your password"]));
  });

  it("reads an article into paragraphs, with a way to a person", async () => {
    const { wrapper, navigate } = harness();
    function Screen() {
      return <HelpArticleBody {...useHelpArticle("reset")} />;
    }
    render(<Screen />, { wrapper });
    expect(await screen.findByText("Press Reset.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-support-article-new"));
    expect(navigate).toHaveBeenCalledWith("/s/message");
  });

  it("a first message becomes a ticket in the tenant, and its thread opens", async () => {
    let inserted: unknown;
    const { wrapper, navigate } = harness({}, (call) => {
      inserted = call.ops.find(([op]) => op === "insert")?.[1][0];
      return { data: { id: "t9" }, error: null };
    });
    const { result } = renderHook(() => useStartConversation(), { wrapper });
    act(() => result.current.composer?.onChangeText("  I need help "));
    act(() => result.current.composer?.onSend());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/s/t9"));
    expect(inserted).toMatchObject({ tenant_id: "ta", type: "question", message: "I need help" });
  });
});

// The same reply expectation and office hours as SupportMessenger's on the web (one shared piece).
describe("the reply expectation on the phone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const office = { timeZone: "America/New_York", hours: [{ days: [1, 2, 3, 4, 5], open: "09:00", close: "17:00" }] };
  const REPORT = "11111111-1111-4111-8111-111111111111";
  const unanswered = (call: Call) => {
    if (call.table === "support_reports") return { data: { id: REPORT, type: "question", message: "Hello?", status: "open", created_at: "2026-11-14T09:00:00Z", updated_at: "x" }, error: null };
    if (call.table === "support_replies") return { data: [], error: null };
    return { data: [], error: null };
  };

  it("says how soon people hear back on the compose screen", async () => {
    const { wrapper } = harness({ replyExpectation: " within a few hours " });
    function Screen() {
      return <ThreadPage {...useStartConversation()} />;
    }
    render(<Screen />, { wrapper });
    expect((await screen.findByTestId("genesis-support-start-expectation")).textContent).toBe("We usually reply within a few hours.");
    const { result } = renderHook(() => useStartConversation(), { wrapper });
    expect(result.current.expectation).toBe("We usually reply within a few hours.");
  });

  it("says when someone is back, outside office hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Saturday noon in New York.
    vi.setSystemTime(new Date("2026-11-14T17:00:00Z"));
    const { wrapper } = harness({ replyExpectation: "within a few hours", officeHours: office });
    const { result } = renderHook(() => useStartConversation(), { wrapper });
    await waitFor(() => expect(result.current.expectation).toMatch(/^We're away right now, and back Monday/));
  });

  it("says nothing extra without either", () => {
    const { wrapper } = harness();
    const { result } = renderHook(() => useStartConversation(), { wrapper });
    expect(result.current.expectation).toBeNull();
    expect(result.current.composer?.above).toBeUndefined();
  });

  it("says where the answer will come under a conversation nobody has answered", async () => {
    const { wrapper } = harness({ replyExpectation: "within a few hours" }, unanswered);
    function Thread() {
      return <ThreadPage {...useSupportThread(REPORT)} />;
    }
    render(<Thread />, { wrapper });
    expect((await screen.findByTestId("genesis-support-thread-awaiting")).textContent).toBe(
      "We've got your message. We usually reply within a few hours. Our reply will show up here, and we'll let you know when it does.",
    );
  });

  it("stops once support answers, and says nothing on a thread without the options", async () => {
    const answered = harness({ replyExpectation: "within a few hours" }, (call) =>
      call.table === "support_replies" ? { data: [{ id: "r1", report_id: REPORT, body: "On it", from_staff: true, author_id: "staff", created_at: "2026-11-14T10:00:00Z" }], error: null } : unanswered(call),
    );
    const first = renderHook(() => useSupportThread(REPORT), { wrapper: answered.wrapper });
    await waitFor(() => expect(first.result.current.messages.length).toBe(2));
    expect(first.result.current.awaiting).toBeNull();
    const plain = harness({}, unanswered);
    const second = renderHook(() => useSupportThread(REPORT), { wrapper: plain.wrapper });
    await waitFor(() => expect(second.result.current.report).not.toBeNull());
    expect(second.result.current.awaiting).toBeNull();
  });
});
