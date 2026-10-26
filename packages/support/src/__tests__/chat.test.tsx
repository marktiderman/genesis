// @feat:support-chat
// The support client's switch between support_replies and genesis-chat, the native thread on
// chat, and the web views over genesis-chat's ChatThread.
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadPage } from "@marktiderman/genesis-ui-native/layouts";
import { createSupportClient, defineSupportChatBlock, SupportError, type SupportChatClient, type SupportChatMessage } from "..";
import { createSupport, useSupportConversation, useSupportThread } from "../native";
import { fakeSupabase, type Call } from "./fake-supabase";

afterEach(cleanup);

const REPORT = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const ME = "00000000-0000-4000-8000-0000000000a1";
const STAFF = "00000000-0000-4000-8000-0000000000c3";

const message = (over: Partial<SupportChatMessage>): SupportChatMessage => ({
  id: "m",
  seq: 1,
  senderId: ME,
  senderRole: "member",
  kind: "text",
  body: "",
  visibility: "everyone",
  createdAt: "2026-10-25T10:00:00Z",
  deletedAt: null,
  attachments: [],
  ...over,
});

function fakeChat(messages: SupportChatMessage[] = []) {
  const unsubscribe = vi.fn();
  const chat = {
    messages: vi.fn(async () => ({ messages, hasEarlier: false })),
    send: vi.fn(async (input: { conversationId: string; clientId: string; body?: string; visibility?: "everyone" | "observers" }) =>
      message({ id: "sent", seq: 99, body: input.body ?? "", visibility: input.visibility ?? "everyone" }),
    ),
    markRead: vi.fn(async () => 1),
    fileUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://files.test/${p}`]))),
    subscribeConversation: vi.fn((_id: string, _me: string, handlers: { onSignal: (s: unknown) => void; onJoin?: () => void }) => {
      chat.handlers = handlers;
      return { unsubscribe };
    }),
    handlers: null as null | { onSignal: (s: unknown) => void; onJoin?: () => void },
    unsubscribe,
  };
  return chat;
}

/** The database with the support-chat block: support_chat_conversation answers. */
const withBlock = (conv: string | null = CONV) => (fn: string) =>
  fn === "support_chat_conversation" ? { data: conv, error: null } : { data: null, error: null };
/** The database without it: PostgREST has no such function. */
const withoutBlock = (fn: string) =>
  fn === "support_chat_conversation" ? { data: null, error: { message: "Could not find the function", code: "PGRST202" } } : { data: null, error: null };

const legacyReplies = (call: Call) =>
  call.table === "support_replies" ? { data: [{ id: "r1", report_id: REPORT, body: "On it", from_staff: true, created_at: "2026-10-24T10:00:00Z" }], error: null } : undefined;

describe("the support client's thread", () => {
  it("stays on support_replies without a chat client, and never asks the database about chat", async () => {
    const fake = fakeSupabase({ respond: legacyReplies, rpc: withBlock() });
    const client = createSupportClient(fake.client);
    expect(await client.thread(REPORT)).toEqual({ mode: "replies", conversationId: null });
    expect((await client.replies(REPORT)).map((r) => r.body)).toEqual(["On it"]);
    await client.markRead(REPORT);
    expect(fake.rpcs.map((r) => r.fn)).toEqual(["support_mark_read"]);
  });

  it("falls back to support_replies when the block's migration isn't applied, and says so once", async () => {
    const fake = fakeSupabase({ respond: legacyReplies, rpc: withoutBlock });
    const chat = fakeChat();
    const told = vi.fn();
    const client = createSupportClient(fake.client, { chat, onChatUnavailable: told });
    expect((await client.replies(REPORT)).map((r) => r.body)).toEqual(["On it"]);
    expect(await client.conversationId(REPORT)).toBeNull();
    await client.reply(REPORT, "Thanks");
    expect(told).toHaveBeenCalledTimes(1);
    expect(told.mock.calls[0]![0]).toMatch(/0001_genesis_support_chat\.sql/);
    expect(fake.rpcs.filter((r) => r.fn === "support_chat_conversation")).toHaveLength(1);
    expect(chat.messages).not.toHaveBeenCalled();
    expect(chat.send).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.table === "support_replies" && c.ops.some(([op]) => op === "insert"))).toBe(true);
  });

  it("refuses an internal note without the block", async () => {
    const client = createSupportClient(fakeSupabase({ rpc: withoutBlock }).client, { chat: fakeChat(), onChatUnavailable: () => undefined });
    await expect(client.reply(REPORT, "note", { internal: true })).rejects.toBeInstanceOf(SupportError);
  });

  it("is loud about any other failure while finding the conversation", async () => {
    const fake = fakeSupabase({ rpc: () => ({ data: null, error: { message: "boom", code: "57014" } }) });
    const client = createSupportClient(fake.client, { chat: fakeChat() });
    await expect(client.replies(REPORT)).rejects.toMatchObject({ name: "SupportError", code: "57014", operation: "thread" });
  });

  it("reads the conversation on genesis-chat with the block: staff, mine, notes and files", async () => {
    const fake = fakeSupabase({ respond: legacyReplies, rpc: withBlock() });
    const chat = fakeChat([
      message({ id: "m1", seq: 1, body: "Any news?" }),
      message({ id: "m2", seq: 2, senderId: STAFF, senderRole: "observer", body: "Here's how", attachments: [{ id: "a1", kind: "image", path: `${CONV}/${STAFF}/x.png`, url: null, mime: "image/png", name: null, width: 10, height: 20, durationMs: null }] }),
      message({ id: "m3", seq: 3, senderId: STAFF, senderRole: "observer", body: "On the old plan", visibility: "observers" }),
      message({ id: "m4", seq: 4, body: "", deletedAt: "2026-10-25T11:00:00Z" }),
      message({ id: "m5", seq: 5, senderId: null, senderRole: "system", kind: "system", body: "joined" }),
    ]);
    const client = createSupportClient(fake.client, { chat });
    expect(await client.thread(REPORT)).toEqual({ mode: "chat", conversationId: CONV });
    const replies = await client.replies(REPORT);
    expect(chat.messages).toHaveBeenCalledWith(CONV, { limit: 200 });
    expect(replies.map((r) => [r.id, r.fromStaff, r.mine, r.internal])).toEqual([
      ["m1", false, true, false],
      ["m2", true, false, false],
      ["m3", true, false, true],
    ]);
    expect(replies[1]!.attachments![0]).toMatchObject({ kind: "image", url: `https://files.test/${CONV}/${STAFF}/x.png` });
    // support_replies isn't read once the thread is on chat.
    expect(fake.calls.some((c) => c.table === "support_replies")).toBe(false);
  });

  it("writes, notes, reads and listens through genesis-chat", async () => {
    const fake = fakeSupabase({ rpc: withBlock() });
    const chat = fakeChat();
    const client = createSupportClient(fake.client, { chat });
    const sent = await client.reply(REPORT, "Thanks!");
    expect(chat.send).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONV, body: "Thanks!", visibility: "everyone" }));
    expect(chat.send.mock.calls[0]![0].clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent).toMatchObject({ id: "sent", mine: true, fromStaff: false });
    await client.reply(REPORT, "Customer on the old plan", { internal: true });
    expect(chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: "observers" }));
    await client.markRead(REPORT);
    expect(chat.markRead).toHaveBeenCalledWith(CONV);
    expect(fake.rpcs.map((r) => r.fn)).not.toContain("support_mark_read");
    // The conversation is looked up once.
    expect(fake.rpcs.filter((r) => r.fn === "support_chat_conversation")).toHaveLength(1);

    const onChange = vi.fn();
    const stop = client.subscribe(REPORT, onChange);
    await waitFor(() => expect(chat.subscribeConversation).toHaveBeenCalledWith(CONV, ME, expect.any(Object)));
    chat.handlers!.onSignal({ type: "message" });
    chat.handlers!.onJoin!();
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
    expect(chat.unsubscribe).toHaveBeenCalled();
  });

  it("stays on support_replies for a report without a conversation the person can read", async () => {
    const fake = fakeSupabase({ respond: legacyReplies, rpc: withBlock(null) });
    const client = createSupportClient(fake.client, { chat: fakeChat() });
    expect(await client.thread(REPORT)).toEqual({ mode: "replies", conversationId: null });
    expect((await client.replies(REPORT)).map((r) => r.body)).toEqual(["On it"]);
  });

  it("gives staff status, assignee and a staff check", async () => {
    const fake = fakeSupabase({ rpc: (fn) => (fn === "support_is_staff" ? { data: true, error: null } : { data: null, error: null }) });
    const client = createSupportClient(fake.client);
    expect(await client.isStaff()).toBe(true);
    await client.setStatus(REPORT, "in_progress");
    await client.assign(REPORT, STAFF);
    await client.assign(REPORT, null);
    expect(fake.rpcs.slice(1)).toEqual([
      { fn: "support_set_report_status", args: { report: REPORT, status: "in_progress", feature: null } },
      { fn: "support_assign_report", args: { report: REPORT, assignee: STAFF } },
      { fn: "support_assign_report", args: { report: REPORT, assignee: null } },
    ]);
  });

  it("declares the support-chat block after support and chat, with this package's migration", () => {
    const block = defineSupportChatBlock();
    expect(block.id).toBe("support-chat");
    expect(block.requires).toEqual(["support-feedback", "chat"]);
    expect(block.contributes?.migrations).toEqual([
      { package: "@marktiderman/genesis-support", file: "migrations/0001_genesis_support_chat.sql", test: "migrations/tests/0001_genesis_support_chat.test.sql" },
    ]);
  });
});

describe("useSupportThread on genesis-chat", () => {
  function harness(chat: SupportChatClient | undefined, rpc: (fn: string) => { data: unknown; error: { message: string; code?: string } | null }) {
    const fake = fakeSupabase({
      rpc,
      respond: (call) =>
        call.table === "support_reports"
          ? { data: { id: REPORT, type: "bug", message: "Broken", status: "open", created_at: "2026-10-24T09:00:00Z", updated_at: "x" }, error: null }
          : legacyReplies(call),
    });
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", chat, basePath: "/settings/support" });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Root = block.Root;
    const wrap = (children: ReactNode) => (
      <QueryClientProvider client={queryClient}>
        <Root>{children}</Root>
      </QueryClientProvider>
    );
    return { fake, wrap };
  }

  it("shows chat replies with their photos and voice notes, never an internal note, and listens live", async () => {
    const chat = fakeChat([
      message({ id: "m1", seq: 1, senderId: STAFF, senderRole: "observer", body: "Try this", attachments: [{ id: "a1", kind: "image", path: "p/1.png", url: null, mime: "image/png", name: null, width: 4, height: 4, durationMs: null }] }),
      message({ id: "m2", seq: 2, senderId: STAFF, senderRole: "observer", body: "", attachments: [{ id: "a2", kind: "voice", path: "p/2.m4a", url: null, mime: "audio/mp4", name: null, width: null, height: null, durationMs: 3000 }] }),
      message({ id: "m3", seq: 3, senderId: STAFF, senderRole: "observer", body: "Secret staff note", visibility: "observers" }),
    ]);
    const { fake, wrap } = harness(chat, withBlock());
    let seen: ReturnType<typeof useSupportThread> | null = null;
    function Thread() {
      const thread = useSupportThread(REPORT);
      seen = thread;
      return <ThreadPage {...thread} />;
    }
    render(wrap(<Thread />));
    expect(await screen.findByText("Try this")).toBeTruthy();
    expect(screen.getByText("Voice message")).toBeTruthy();
    expect(screen.queryByText("Secret staff note")).toBeNull();
    await waitFor(() => expect(chat.subscribeConversation).toHaveBeenCalled());
    await waitFor(() => expect(chat.markRead).toHaveBeenCalledWith(CONV));
    expect(seen!.mode).toBe("chat");
    expect(seen!.conversationId).toBe(CONV);
    expect(fake.calls.some((c) => c.table === "support_replies")).toBe(false);
  });

  it("stays on support_replies, polled, without the block", async () => {
    const chat = fakeChat();
    const { wrap } = harness(chat, withoutBlock);
    let seen: ReturnType<typeof useSupportThread> | null = null;
    function Thread() {
      const thread = useSupportThread(REPORT);
      seen = thread;
      return <ThreadPage {...thread} />;
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(wrap(<Thread />));
    expect(await screen.findByText("On it")).toBeTruthy();
    expect(seen!.mode).toBe("replies");
    expect(chat.subscribeConversation).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("useSupportConversation hands a native screen the conversation id", async () => {
    const { wrap } = harness(fakeChat(), withBlock());
    let seen: ReturnType<typeof useSupportConversation> | null = null;
    function Probe() {
      seen = useSupportConversation(REPORT);
      return null;
    }
    render(wrap(<Probe />));
    await waitFor(() => expect(seen!.conversationId).toBe(CONV));
    expect(seen!.mode).toBe("chat");
  });
});

describe("the web views on genesis-chat", () => {
  async function mount(ui: (client: ReturnType<typeof createSupportClient>) => ReactNode, myRole: "member" | "observer") {
    const { ChatProvider } = await import("@marktiderman/genesis-chat/react");
    const { createMemoryChatClient } = await import("@marktiderman/genesis-chat/web");
    const me = myRole === "observer" ? STAFF : ME;
    const chat = createMemoryChatClient({
      me,
      conversations: [
        {
          id: CONV,
          kind: "support",
          title: "Export is broken",
          members: [{ userId: ME }],
          myRole: myRole === "observer" ? "observer" : null,
          messages: [
            { id: "m1", senderId: ME, body: "Any news?", createdAt: "2026-10-25T10:00:00Z" },
            { id: "m2", senderId: STAFF, senderRole: "observer", body: "Fixed in 1.5", createdAt: "2026-10-25T10:05:00Z" },
          ],
        },
      ],
    });
    const fake = fakeSupabase({
      userId: me,
      rpc: withBlock(),
      respond: (call) =>
        call.table === "support_reports"
          ? { data: { id: REPORT, user_id: ME, type: "bug", title: "Export is broken", message: "The CSV is empty", status: "in_progress", created_at: "2026-10-25T09:00:00Z", updated_at: "x" }, error: null }
          : undefined,
    });
    const client = createSupportClient(fake.client, { chat });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ChatProvider client={chat} userId={me}>
          {ui(client)}
        </ChatProvider>
      </QueryClientProvider>,
    );
    return { fake };
  }

  it("SupportReportThread shows the report, then the conversation, naming staff Support", async () => {
    const { SupportReportThread } = await import("../web-chat");
    await mount((client) => <SupportReportThread client={client} reportId={REPORT} />, "member");
    expect(await screen.findByText("The CSV is empty")).toBeTruthy();
    expect(screen.getByTestId("genesis-support-report-status").textContent).toBe("In progress");
    expect(await screen.findByText("Fixed in 1.5")).toBeTruthy();
    const labels = [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.includes("Support") && l.includes("Fixed in 1.5"))).toBe(true);
  });

  it("SupportStaffThread adds status, assignee and the internal-note toggle", async () => {
    const { SupportStaffThread } = await import("../web-chat");
    await mount(
      (client) => (
        <SupportStaffThread
          client={client}
          reportId={REPORT}
          resolveUser={(id) => ({ name: id === ME ? "Ada" : "Sam (support)" })}
          staff={[{ id: STAFF, name: "Sam (support)" }]}
        />
      ),
      "observer",
    );
    expect(await screen.findByText("Any news?")).toBeTruthy();
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
    expect(screen.getByTestId("genesis-support-staff-status").textContent).toContain("In progress");
    expect(screen.getByTestId("genesis-support-staff-assignee").textContent).toContain("Nobody");
    expect(await screen.findByRole("button", { name: /internal note/i })).toBeTruthy();
  });

  it("says so when the report has no conversation on chat", async () => {
    const { SupportReportThread } = await import("../web-chat");
    const { ChatProvider } = await import("@marktiderman/genesis-chat/react");
    const { createMemoryChatClient } = await import("@marktiderman/genesis-chat/web");
    const chat = createMemoryChatClient({ me: ME, conversations: [] });
    const fake = fakeSupabase({
      rpc: withoutBlock,
      respond: (call) => (call.table === "support_reports" ? { data: { id: REPORT, type: "bug", message: "x", status: "open", created_at: "x", updated_at: "x" }, error: null } : undefined),
    });
    const client = createSupportClient(fake.client, { chat, onChatUnavailable: () => undefined });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatProvider client={chat} userId={ME}>
          <SupportReportThread client={client} reportId={REPORT} />
        </ChatProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("This conversation isn't available")).toBeTruthy();
  });
});
