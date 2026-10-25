// @feat:observability
import { describe, expect, it } from "vitest";
import { checkEvent, defineEvents } from "../../observability/events";

const events = defineEvents({
  "auth.signed_in": { method: ["email", "apple"] },
  "settings.opened": {},
  "checkin.saved": { mood: "number", first: "boolean" },
});

describe("defineEvents", () => {
  it("refuses free-text props, bad names and empty lists, listing every problem", () => {
    expect(() =>
      defineEvents({
        "Bad Name": {},
        "note.saved": { text: "string" as never, Kind: ["a"], empty: [] },
      }),
    ).toThrow(/Bad Name[\s\S]*free text is not allowed[\s\S]*Kind[\s\S]*empty list/);
  });
});

describe("checkEvent", () => {
  it("passes props that fit the schema", () => {
    expect(checkEvent(events, "auth.signed_in", { method: "apple" })).toEqual({ ok: true, props: { method: "apple" } });
    expect(checkEvent(events, "checkin.saved", { mood: 4, first: true })).toEqual({ ok: true, props: { mood: 4, first: true } });
    expect(checkEvent(events, "settings.opened", undefined)).toEqual({ ok: true, props: {} });
  });

  it("drops an unknown event, an unknown prop and a value outside its list", () => {
    expect(checkEvent(events, "auth.signed_out", {})).toMatchObject({ ok: false });
    expect(checkEvent(events, "auth.signed_in", { email: "a@b.co" })).toMatchObject({ ok: false, problem: expect.stringContaining('no prop "email"') });
    expect(checkEvent(events, "auth.signed_in", { method: "jane@example.com" })).toMatchObject({ ok: false });
    expect(checkEvent(events, "checkin.saved", { mood: Number.NaN })).toMatchObject({ ok: false });
    expect(checkEvent(events, "checkin.saved", { first: "yes" })).toMatchObject({ ok: false });
  });

  it("does not treat inherited names as events", () => {
    expect(checkEvent(events, "toString", {})).toMatchObject({ ok: false });
  });
});
