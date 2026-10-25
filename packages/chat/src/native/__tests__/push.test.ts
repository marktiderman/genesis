// @feat:chat
import { describe, expect, it, vi } from "vitest";
import {
  CHAT_PUSH_CATEGORY,
  chatNotificationActions,
  chatPath,
  chatPushCategory,
  chatThreadMatch,
  conversationIdFromData,
  handleChatPushResponse,
  registerChatNotificationActions,
  replyClientId,
  replyClientIdFor,
  type ChatPushResponseLike,
} from "../push";
import { createOutbox, memoryOutboxStore } from "../../core/outbox";
import type { ChatClient } from "../../core/client";

const CONV = "6f1d2c3b-4a59-4e8f-9a7b-1c2d3e4f5a6b";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function response(action: string, extra: Partial<ChatPushResponseLike> = {}, data: Record<string, unknown> = { url: chatPath(CONV), seq: 7 }): ChatPushResponseLike {
  return { actionIdentifier: action, notification: { request: { identifier: "push-123", content: { data } } }, ...extra };
}

function fakeClient() {
  return { send: vi.fn(async () => ({}) as never), markRead: vi.fn(async () => 7) };
}

describe("the messages category", () => {
  it("is one preferences category and two actions, neither opening the app", async () => {
    expect(chatPushCategory()).toMatchObject({ id: "messages", title: "Messages" });
    const actions = chatNotificationActions();
    expect(actions.map((a) => a.identifier)).toEqual(["reply", "mark-read"]);
    expect(actions[0]!.textInput).toEqual({ submitButtonTitle: "Send", placeholder: "Message" });
    expect(actions.every((a) => a.options.opensAppToForeground === false)).toBe(true);
    const setNotificationCategoryAsync = vi.fn(async () => undefined);
    await registerChatNotificationActions({ setNotificationCategoryAsync });
    expect(setNotificationCategoryAsync).toHaveBeenCalledWith(CHAT_PUSH_CATEGORY, actions);
  });

  it("registering never throws: a module without categories is reported, not fatal", async () => {
    const onError = vi.fn();
    await expect(registerChatNotificationActions({} as never, undefined, onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
    const failing = { setNotificationCategoryAsync: () => Promise.reject(new Error("no")) };
    await expect(registerChatNotificationActions(failing, undefined, onError)).resolves.toBeUndefined();
  });

  it("finds the conversation in data.conversationId or data.url, nowhere else", () => {
    expect(conversationIdFromData({ url: `/messages/${CONV}` })).toBe(CONV);
    expect(conversationIdFromData({ url: `/messages/${CONV}?x=1` })).toBe(CONV);
    expect(conversationIdFromData({ conversationId: CONV.toUpperCase() })).toBe(CONV);
    expect(conversationIdFromData({ url: "https://evil.example/messages/" + CONV })).toBeNull();
    expect(conversationIdFromData({ url: "/messages/not-an-id" })).toBeNull();
    expect(conversationIdFromData(null)).toBeNull();
  });
});

describe("handleChatPushResponse", () => {
  it("Reply sends the typed text with a client id from the notification, and marks read", async () => {
    const client = fakeClient();
    const dismissNotificationAsync = vi.fn(async () => undefined);
    const outcome = await handleChatPushResponse(response("reply", { userText: "  on my way " }), { client, notifications: { dismissNotificationAsync } });
    expect(outcome).toBe("replied");
    expect(client.send).toHaveBeenCalledWith({ conversationId: CONV, clientId: replyClientIdFor("push-123", { url: chatPath(CONV), seq: 7 }, "on my way"), body: "on my way" });
    expect(client.markRead).toHaveBeenCalledWith(CONV);
    expect(dismissNotificationAsync).toHaveBeenCalledWith("push-123");
  });

  it("replying twice from the same notification uses the same client id (the server posts it once)", async () => {
    const client = fakeClient();
    await handleChatPushResponse(response("reply", { userText: "yes" }), { client });
    await handleChatPushResponse(response("reply", { userText: "yes" }), { client });
    const ids = client.send.mock.calls.map((c) => (c as unknown as [{ clientId: string }])[0].clientId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toMatch(UUID);
  });

  it("Mark read marks up to the pushed message", async () => {
    const client = fakeClient();
    expect(await handleChatPushResponse(response("mark-read"), { client })).toBe("marked-read");
    expect(client.markRead).toHaveBeenCalledWith(CONV, 7);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("reads the data createChatRunner sends: conversationId and seq, and a seq that is null", async () => {
    const client = fakeClient();
    const data = { url: chatPath(CONV), conversationId: CONV, messageId: "m1", seq: 12 };
    expect(await handleChatPushResponse(response("mark-read", {}, data), { client })).toBe("marked-read");
    expect(client.markRead).toHaveBeenLastCalledWith(CONV, 12);
    await handleChatPushResponse(response("mark-read", {}, { conversationId: CONV, seq: null }), { client });
    expect(client.markRead).toHaveBeenLastCalledWith(CONV, undefined);
  });

  it("leaves taps, empty replies and other pushes alone", async () => {
    const client = fakeClient();
    expect(await handleChatPushResponse(response("expo.modules.notifications.actions.DEFAULT"), { client })).toBe("ignored");
    expect(await handleChatPushResponse(response("reply", { userText: "   " }), { client })).toBe("ignored");
    expect(await handleChatPushResponse(response("reply", { userText: "hi" }, { url: "/settings" }), { client })).toBe("ignored");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("two replies under one notification id (iOS collapses pushes) get two client ids", async () => {
    const client = fakeClient();
    await handleChatPushResponse(response("reply", { userText: "yes" }, { conversationId: CONV, messageId: "m1" }), { client });
    await handleChatPushResponse(response("reply", { userText: "yes" }, { conversationId: CONV, messageId: "m2" }), { client });
    // No messageId: the text tells them apart.
    await handleChatPushResponse(response("reply", { userText: "one" }, { conversationId: CONV }), { client });
    await handleChatPushResponse(response("reply", { userText: "two" }, { conversationId: CONV }), { client });
    const ids = client.send.mock.calls.map((c) => (c as unknown as [{ clientId: string }])[0].clientId);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(UUID);
  });

  it("with the live outbox, the reply is queued there, once, and an offline one waits failed instead of being lost", async () => {
    const client = fakeClient();
    client.send.mockRejectedValue(new Error("Network request failed"));
    const store = memoryOutboxStore();
    const outbox = createOutbox({ client: client as unknown as ChatClient, userId: "u1", store });
    const r = response("reply", { userText: "on my way" }, { conversationId: CONV, messageId: "m1" });
    expect(await handleChatPushResponse(r, { client, outbox })).toBe("queued");
    expect(await handleChatPushResponse(r, { client, outbox: () => outbox })).toBe("queued");
    expect(client.markRead).not.toHaveBeenCalled();
    expect(outbox.pending(CONV)[0]?.status).toBe("failed");
    expect(outbox.pending(CONV)).toHaveLength(1);
    expect(outbox.pending(CONV)[0]).toMatchObject({ input: { body: "on my way", clientId: replyClientIdFor("push-123", r.notification.request.content.data, "on my way") } });
    expect(await store.load()).toHaveLength(1);
  });

  it("with the live outbox online, waits for the reply to go, then marks read", async () => {
    const client = fakeClient();
    const outbox = createOutbox({ client: client as unknown as ChatClient, userId: "u1", store: memoryOutboxStore() });
    const r = response("reply", { userText: "on my way" }, { conversationId: CONV, messageId: "m1" });
    expect(await handleChatPushResponse(r, { client, outbox })).toBe("replied");
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.markRead).toHaveBeenCalledWith(CONV);
    expect(outbox.pending(CONV)).toHaveLength(0);
  });

  it("when the chat screens open while a direct send fails, the reply goes to their outbox, not behind its back", async () => {
    const client = fakeClient();
    const store = memoryOutboxStore();
    const outbox = createOutbox({ client: client as unknown as ChatClient, userId: "u1", store });
    let live: typeof outbox | null = null;
    client.send.mockImplementationOnce(async () => {
      live = outbox; // Messages mounted meanwhile.
      throw new Error("Network request failed");
    });
    client.send.mockRejectedValue(new Error("Network request failed"));
    const r = response("reply", { userText: "on my way" }, { conversationId: CONV });
    expect(await handleChatPushResponse(r, { client, outbox: () => live, store, userId: "u1" })).toBe("queued");
    expect(outbox.pending(CONV)).toHaveLength(1);
    expect(await store.load()).toHaveLength(1);
  });

  it("without the live outbox, a reply that can't be sent is added to the saved outbox, once, for Retry", async () => {
    const client = fakeClient();
    client.send.mockRejectedValue(new Error("Network request failed"));
    const store = memoryOutboxStore();
    await store.save([]);
    const r = response("reply", { userText: "on my way" }, { conversationId: CONV, messageId: "m1" });
    const onError = vi.fn();
    expect(await handleChatPushResponse(r, { client, store, userId: "u1", onError })).toBe("queued");
    expect(await handleChatPushResponse(r, { client, store, userId: "u1" })).toBe("queued");
    const saved = await store.load();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ status: "failed", senderId: "u1", input: { conversationId: CONV, body: "on my way" } });
    expect(client.markRead).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    // The outbox the chat screens open later shows it, and Retry sends it with the same client id.
    client.send.mockResolvedValue({} as never);
    const outbox = createOutbox({ client: client as unknown as ChatClient, userId: "u1", store });
    await outbox.load();
    expect(outbox.pending(CONV)).toHaveLength(1);
    await outbox.retry(saved[0]!.clientId);
    await vi.waitFor(() => expect(outbox.pending(CONV)).toHaveLength(0));
    expect(client.send).toHaveBeenLastCalledWith(expect.objectContaining({ clientId: saved[0]!.clientId, body: "on my way" }));
  });

  it("never throws: a failed send is the outcome, reported", async () => {
    const client = fakeClient();
    client.send.mockRejectedValueOnce(new Error("offline"));
    const onError = vi.fn();
    expect(await handleChatPushResponse(response("reply", { userText: "hi" }), { client, onError })).toBe("failed");
    expect(onError).toHaveBeenCalled();
  });
});

describe("replyClientId", () => {
  it("keeps a uuid, and hashes anything else into a stable valid one", () => {
    expect(replyClientId(CONV.toUpperCase())).toBe(CONV);
    const a = replyClientId("0:1729845612:com.example/notif-42");
    expect(a).toMatch(UUID);
    expect(a[14]).toBe("8");
    expect(["8", "9", "a", "b"]).toContain(a[19]);
    expect(replyClientId("0:1729845612:com.example/notif-42")).toBe(a);
    expect(replyClientId("0:1729845612:com.example/notif-43")).not.toBe(a);
  });
});

describe("chatThreadMatch", () => {
  it("matches only the open conversation's pushes", () => {
    const match = chatThreadMatch(CONV)!;
    expect(match({ url: chatPath(CONV) })).toBe(true);
    expect(match({ url: chatPath("7f1d2c3b-4a59-4e8f-9a7b-1c2d3e4f5a6b") })).toBe(false);
    expect(chatThreadMatch(null)).toBeNull();
  });
});
