import { describe, expect, it } from "vitest";
import { MESSAGE_ACTIONS } from "@marktiderman/genesis-notifications";
import { CHAT_NOTIFICATION_CATEGORIES } from "../../server/notifications";
import { CHAT_PUSH_CATEGORY, chatNotificationActions } from "../push";

// A chat push sent through genesis-notifications must land on the category and
// action ids this package's push handler (and genesis-native's notification
// service extension, which looks for "messages") answers to.
describe("chat and genesis-notifications agree on push ids", () => {
  it("the same action ids", () => {
    expect(MESSAGE_ACTIONS.actions.map((a) => a.id)).toEqual(chatNotificationActions().map((a) => a.identifier));
  });

  it("the same category id", () => {
    expect(Object.keys(CHAT_NOTIFICATION_CATEGORIES)).toEqual([CHAT_PUSH_CATEGORY]);
    expect(CHAT_PUSH_CATEGORY).toBe("messages");
  });
});
