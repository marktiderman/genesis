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
  type ChatPushResponseLike,
} from "../push";

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
  it("Reply sends the typed text with the notification's id as the client id, and marks read", async () => {
    const client = fakeClient();
    const dismissNotificationAsync = vi.fn(async () => undefined);
    const outcome = await handleChatPushResponse(response("reply", { userText: "  on my way " }), { client, notifications: { dismissNotificationAsync } });
    expect(outcome).toBe("replied");
    expect(client.send).toHaveBeenCalledWith({ conversationId: CONV, clientId: replyClientId("push-123"), body: "on my way" });
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
