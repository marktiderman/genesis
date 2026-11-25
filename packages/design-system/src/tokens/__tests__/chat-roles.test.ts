import { describe, expect, it } from "vitest";
import { CHAT_ACCENTS, CHAT_ROLES, resolveChatRoles } from "../chat-roles";

describe("resolveChatRoles", () => {
  it("draws Messages' system colors on iOS and its own where it has one", () => {
    const { roles, accents } = resolveChatRoles({ target: "ios", scheme: "dark", platformColor: (name) => ({ name }) });
    expect(roles.sent).toEqual({ name: "systemBlue" });
    expect(roles.onReceived).toEqual({ name: "label" });
    expect(roles.received).toBe("#262628");
    expect(roles.pageSolid).toBe("#000000");
    expect(accents.photos).toEqual({ name: "systemOrange" });
    expect(accents.camera).toBe("#3A3A3C");
  });

  it("gives every role and accent a value per scheme off iOS", () => {
    for (const scheme of ["light", "dark"] as const) {
      const { roles, accents } = resolveChatRoles({ target: "android", scheme });
      for (const role of CHAT_ROLES) expect(typeof roles[role]).toBe("string");
      for (const accent of CHAT_ACCENTS) expect(typeof accents[accent]).toBe("string");
    }
    expect(resolveChatRoles({ target: "android", scheme: "light" }).roles.sent).toBe("#007AFF");
    expect(resolveChatRoles({ target: "android", scheme: "dark" }).roles.sent).toBe("#0A84FF");
  });

  it("stays the same whatever the brand: it takes none", () => {
    const a = resolveChatRoles({ target: "web", scheme: "light" });
    const b = resolveChatRoles({ target: "web", scheme: "light" });
    expect(a).toEqual(b);
  });
});
