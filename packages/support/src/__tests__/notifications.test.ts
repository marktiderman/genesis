// @feat:support-notifications
// Support's default notification types, as genesis-notifications takes them.
import { describe, expect, it } from "vitest";
import { defineNotifications } from "@marktiderman/genesis-notifications";
import { SUPPORT_NOTIFICATION_TYPES, supportNotificationTypes } from "..";

describe("support's notification types", () => {
  const support = supportNotificationTypes({ basePath: "/settings/support" });
  const registry = defineNotifications({ categories: support.categories, types: support.types });

  it("is a registry genesis-notifications accepts, with the three types migration 0024 sends", () => {
    expect(Object.keys(registry.types).sort()).toEqual([...SUPPORT_NOTIFICATION_TYPES].sort());
    expect(registry.toTypeRows().map((r) => [r.key, r.category])).toEqual([
      ["support.message", "support"],
      ["support.reply", "support"],
      ["support.verify", "support"],
    ]);
  });

  it("tells agents who wrote, linking to the ticket at its desk", () => {
    expect(registry.render("support.message", { ticket_id: "t1", by: "Bo", title: "Export", excerpt: "It does nothing", new: true, desk: "acme" })).toEqual({
      title: "Bo: Export",
      body: "It does nothing",
      url: "/settings/support/agent/t1?desk=acme",
    });
    expect(registry.render("support.message", { ticket_id: "t1", by: "Ana", title: "Export", escalated: true }).title).toBe("Sent up to you: Export");
    expect(registry.render("support.message", { ticket_id: "t1", by: "Bo", title: "Export" }).url).toBe("/settings/support/agent/t1");
  });

  it("tells the person support answered, by email after a while and with no push while chat pushes", () => {
    expect(registry.render("support.reply", { ticket_id: "t1", title: "Export", excerpt: "Fixed", from: "Acme" })).toEqual({
      title: "Acme replied: Export",
      body: "Fixed",
      url: "/settings/support/t1",
    });
    const reply = registry.toTypeRows().find((r) => r.key === "support.reply")!;
    expect(reply.channels).toEqual({ in_app: true, email: true });
    expect(reply.email_delay_seconds).toBe(900);
    const pushing = supportNotificationTypes({ chatPushes: false }).types["support.reply"];
    expect(pushing.channels.push).toBe(true);
  });

  it("asks the person to check a fix", () => {
    expect(registry.render("support.verify", { ticket_id: "t1", title: "Export" }).title).toBe("Is it fixed? Export");
  });
});

describe("support's emails", async () => {
  const { supportEmailTemplate, supportEmailTemplates, stripReply, REPLY_MARKER } = await import("../email");
  const ctx = (type: string, data: Record<string, unknown>) => ({
    type,
    category: "support",
    data,
    text: { title: "Bo: Export", body: "It does" },
    recipient: { email: "ana@example.test", name: null },
    brand: { name: "Acme" },
    tenantId: null,
    transactional: false,
    secretLink: null,
    unsubscribeUrl: "https://acme.test/u",
    url: "https://acme.test/support/agent/t1",
  });

  it("puts the whole message in, under a subject the ticket's emails share", async () => {
    const mail = await supportEmailTemplate({ replies: false })(ctx("support.message", { title: "Export", body: "It does nothing at all" }));
    expect(mail.subject).toBe("[Support] Export");
    expect(mail.text).toContain("It does nothing at all");
    expect(mail.text).not.toContain(REPLY_MARKER);
    const reply = await supportEmailTemplate({ replies: false })(ctx("support.reply", { title: "Export", body: "Fixed" }));
    expect(reply.subject).toBe("Re: Export");
  });

  it("marks where a reply's quote starts when replies are set up, so stripReply drops it", async () => {
    const mail = await supportEmailTemplate({ replies: true })(ctx("support.reply", { title: "Export", body: "Fixed" }));
    expect(mail.text.startsWith(REPLY_MARKER)).toBe(true);
    expect(mail.html).toContain(REPLY_MARKER);
    expect(mail.text).toContain("You can reply to this email");
    const quoted = `Thanks, works now\n\n${mail.text.split("\n").map((l) => `> ${l}`).join("\n")}`;
    expect(stripReply(quoted)).toBe("Thanks, works now");
  });

  it("covers the three types", () => {
    expect(Object.keys(supportEmailTemplates({ replies: true })).sort()).toEqual([...SUPPORT_NOTIFICATION_TYPES].sort());
  });
});
