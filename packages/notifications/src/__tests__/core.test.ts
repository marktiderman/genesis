// @feat:notifications
import { describe, expect, it } from "vitest";
import { NotificationRegistryError, SecretInDataError, assertNoSecrets, defineNotifications, recipientsToJson } from "../core/index";
import { USER, registry } from "./fixtures";

describe("defineNotifications", () => {
  it("lists every problem at once", () => {
    try {
      defineNotifications({
        categories: { Bad: { label: "" } },
        actions: { "has-dash": { actions: [] } },
        types: {
          "x.y": { category: "nope" as never, channels: {}, render: () => ({ title: "x" }) },
          "z.delay": { category: "Bad" as never, channels: { email: true }, emailDelaySeconds: 60, render: () => ({ title: "x" }) },
          "z.secret": { category: "Bad" as never, channels: { push: true }, secretLink: true, render: () => ({ title: "x" }) },
        },
      });
      throw new Error("did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(NotificationRegistryError);
      const problems = (error as NotificationRegistryError).problems.join("\n");
      expect(problems).toContain('category "Bad"');
      expect(problems).toContain("needs a label");
      expect(problems).toContain('actions "has-dash"');
      expect(problems).toContain("one to four actions");
      expect(problems).toContain('unknown category "nope"');
      expect(problems).toContain("offers no channel");
      expect(problems).toContain("needs the in_app channel");
      expect(problems).toContain("secretLink is for email");
    }
  });

  it("mirrors types as rows, with critical from the category", () => {
    const rows = registry.toTypeRows();
    expect(rows.find((r) => r.key === "security.new_sign_in")).toMatchObject({ critical: true, transactional: false, category: "security" });
    expect(rows.find((r) => r.key === "chat.message")).toMatchObject({ email_delay_seconds: 600, ios_category: "message", channels: { in_app: true, push: true, email: true } });
    expect(rows.find((r) => r.key === "forms.receipt")).toMatchObject({ transactional: true, secret_link: true });
  });

  it("builds the matrix from what the types offer", () => {
    const m = registry.matrix();
    expect(m.find((r) => r.id === "forms")).toMatchObject({ channels: ["email"], critical: false });
    expect(m.find((r) => r.id === "security")).toMatchObject({ channels: ["in_app", "email"], critical: true });
    expect(m.find((r) => r.id === "messages")?.defaults).toEqual({ in_app: true, push: true, email: true });
  });

  it("defines device categories with Reply and Mark as read, and a channel per category", () => {
    expect(registry.deviceCategories()).toEqual([
      { identifier: "message", actions: [{ id: "reply", title: "Reply", textInput: { placeholder: "Message", submitTitle: "Send" } }, { id: "mark_read", title: "Mark as read" }] },
    ]);
    expect(registry.androidChannels().find((c) => c.id === "messages")).toEqual({ id: "messages", name: "Messages", importance: "high" });
  });

  it("renders, and never blanks a title", () => {
    expect(registry.render("chat.message", { sender_name: "Sam", preview: "Hi", conversation_id: "c1" })).toEqual({ title: "Sam", body: "Hi", url: "/messages/c1" });
    const broken = defineNotifications({ categories: { a: { label: "A" } }, types: { "a.b": { category: "a", channels: { in_app: true }, render: () => { throw new Error("x"); } } } });
    expect(broken.render("a.b", {})).toEqual({ title: "a.b" });
    expect(() => registry.type("nope")).toThrow(NotificationRegistryError);
  });
});

describe("assertNoSecrets", () => {
  it("refuses keys named like secrets, at any depth", () => {
    expect(() => assertNoSecrets({ invite_token: "x" })).toThrow(SecretInDataError);
    expect(() => assertNoSecrets({ a: { password: "x" } })).toThrow(/data\.a\.password/);
    expect(() => assertNoSecrets({ resetLink: "x" })).toThrow();
    expect(() => assertNoSecrets({ reset_link: "x" })).toThrow();
    for (const key of ["inviteToken", "accessToken", "authToken", "clientSecret", "resetPassword"]) expect(() => assertNoSecrets({ [key]: "x" }), key).toThrow(SecretInDataError);
    expect(() => assertNoSecrets({ token_count: 3, tokenCount: 3 })).not.toThrow();
  });
  it("refuses links that carry a credential", () => {
    expect(() => assertNoSecrets({ link: "https://app.example/accept?token=abc" })).toThrow(SecretInDataError);
    expect(() => assertNoSecrets({ link: "https://app.example/r?id=1&sig=abc" })).toThrow();
    expect(() => assertNoSecrets({ url: "/messages/42", response_id: "r1" })).not.toThrow();
  });
});

describe("recipientsToJson", () => {
  it("takes user ids and email-only people", () => {
    expect(recipientsToJson([USER, { userId: USER }, { email: " a@example.test ", name: "A", ref: "people:1" }])).toEqual([
      { user_id: USER },
      { user_id: USER },
      { email: "a@example.test", name: "A", ref: "people:1" },
    ]);
  });
  it("carries a recipient's own badge (chat's unread count per person)", () => {
    expect(recipientsToJson([{ userId: USER, badge: 3 }])).toEqual([{ user_id: USER, badge: 3 }]);
    expect(() => recipientsToJson([{ userId: USER, badge: -1 }])).toThrow(/badge/);
  });
  it("refuses malformed ones", () => {
    expect(() => recipientsToJson([])).toThrow(/no recipients/);
    expect(() => recipientsToJson(["nope"])).toThrow(/not a user id/);
    expect(() => recipientsToJson([{ email: "a@b" }])).toThrow(/valid email/);
  });
});
