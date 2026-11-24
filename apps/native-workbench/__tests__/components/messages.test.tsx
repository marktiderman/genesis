import { describe, expect, it } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import type { ChatAttachment } from "@marktiderman/genesis-chat";
import { copy } from "@/copy";
import { attachmentKinds, kindAllowsTopics } from "@/lib/chat";
import { expectPathname, renderApp } from "./render-app";

const checkIn = { id: "a1", kind: "check_in", ref: { title: "Hilltop office" } } as unknown as ChatAttachment;

describe("Messages", () => {
  it("opens a check-in from a conversation inside the Messages stack, so Back returns to it", async () => {
    const app = await renderApp("/messages/check-in", "person@example.com");
    expect(await screen.findByTestId("check-in")).toBeOnTheScreen();
    await expectPathname(app, "/messages/check-in");
  });

  it("shows the sender Sent on their own check-in card, and the others Answer", () => {
    const kind = attachmentKinds.check_in!;
    const call = <R,>(fn: unknown, mine: boolean) => (fn as (a: ChatAttachment, ctx: { mine: boolean }) => R)(checkIn, { mine });
    expect(call<{ label: string } | null>(kind.action, false)?.label).toBe(copy.messages.checkInAnswer);
    expect(call(kind.action, true)).toBeNull();
    expect(call(kind.subtitle, true)).toBe(`${copy.messages.checkInSent} · Hilltop office`);
    expect(call(kind.subtitle, false)).toBe("Hilltop office");
    expect(kind.title(checkIn)).toBe(copy.messages.checkInCard);
  });

  it("offers topics in a group, not in a direct conversation", () => {
    expect(kindAllowsTopics({ maxMembers: null })).toBe(true);
    expect(kindAllowsTopics({ maxMembers: 12 })).toBe(true);
    expect(kindAllowsTopics({ maxMembers: 2 })).toBe(false);
    expect(kindAllowsTopics(null)).toBe(false);
  });
});
