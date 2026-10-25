// @feat:push
import { describe, expect, it, vi } from "vitest";
import { createPush, notificationAction, type PushBackend } from "../../push";
import { createRegistration } from "../../push/registration";
import { memoryStorage, settle } from "../fakes";
import { DEFAULT_ACTION, fakeBackend, fakeNotifications } from "./fakes";

describe("the install id, for a backend that uses one", () => {
  const make = (backend: PushBackend, storage = memoryStorage(), randomUUID?: () => string) => {
    const n = fakeNotifications();
    return createRegistration({
      notifications: n.module,
      backend,
      projectId: "p",
      platform: "ios",
      appVersion: "1.0",
      storage,
      storageKeyPrefix: "t",
      ensureChannels: async () => {},
      isCurrent: () => true,
      now: () => 0,
      randomUUID,
    });
  };

  it("is made once and kept across sign-ins", async () => {
    const register = vi.fn(async () => {});
    const backend: PushBackend = { ...fakeBackend().backend, register, usesInstallationId: true };
    const storage = memoryStorage();
    await make(backend, storage, () => "11111111-1111-4111-8111-111111111111").sync("u1");
    await make(backend, storage, () => "22222222-2222-4222-8222-222222222222").sync("u2");
    expect(register).toHaveBeenNthCalledWith(1, "ExponentPushToken[device-1]", "ios", "1.0", "11111111-1111-4111-8111-111111111111");
    expect(register).toHaveBeenNthCalledWith(2, "ExponentPushToken[device-1]", "ios", "1.0", "11111111-1111-4111-8111-111111111111");
  });

  it("is never sent to a backend that doesn't ask for it (migration 0005's)", async () => {
    const { backend } = fakeBackend();
    await make(backend).sync("u1");
    expect(backend.register).toHaveBeenCalledWith("ExponentPushToken[device-1]", "ios", "1.0");
  });
});

describe("device categories", () => {
  it("registers each category's buttons when the block starts", async () => {
    const n = fakeNotifications();
    const setNotificationCategoryAsync = vi.fn(async () => null);
    const push = createPush({
      notifications: { ...n.module, setNotificationCategoryAsync },
      platform: "ios",
      backend: fakeBackend().backend,
      deviceCategories: [{ identifier: "message", actions: [{ id: "reply", title: "Reply", textInput: { placeholder: "Message", submitTitle: "Send" } }, { id: "mark_read", title: "Mark as read" }] }],
    });
    const stop = push.start();
    await settle();
    expect(setNotificationCategoryAsync).toHaveBeenCalledWith(
      "message",
      [
        { identifier: "reply", buttonTitle: "Reply", textInput: { placeholder: "Message", submitButtonTitle: "Send" }, options: { opensAppToForeground: false, isDestructive: false, isAuthenticationRequired: false } },
        { identifier: "mark_read", buttonTitle: "Mark as read", options: { opensAppToForeground: false, isDestructive: false, isAuthenticationRequired: false } },
      ],
      undefined,
    );
    stop();
  });
});

describe("notificationAction", () => {
  const response = (actionIdentifier: string, userText?: string) => ({
    actionIdentifier,
    ...(userText !== undefined ? { userText } : {}),
    notification: { request: { identifier: "x", content: { data: { notification_id: "n1", url: "/messages/c1" } } } },
  });
  it("reads a reply with the notification id (the reply's client id) and its link", () => {
    expect(notificationAction(response("reply", "On my way"))).toEqual({ actionId: "reply", notificationId: "n1", text: "On my way", url: "/messages/c1", data: { notification_id: "n1", url: "/messages/c1" } });
    expect(notificationAction(response("mark_read"))).toMatchObject({ actionId: "mark_read", notificationId: "n1", text: null });
  });
  it("is null for a plain tap or a dismissal", () => {
    expect(notificationAction(response(DEFAULT_ACTION))).toBeNull();
    expect(notificationAction(response("com.apple.UNNotificationDismissActionIdentifier"))).toBeNull();
  });
});
