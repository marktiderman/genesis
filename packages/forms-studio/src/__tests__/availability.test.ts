// @feat:forms-studio
import { describe, expect, it } from "vitest";
import { formAvailability, isFull, parseInstant, takesResponses } from "../availability";

const now = new Date("2026-10-22T12:00:00Z");
const live = { status: "active" as const };

describe("formAvailability", () => {
  it("is live when active, published, open and under its cap", () => {
    expect(formAvailability(live, now)).toBe("live");
    expect(
      formAvailability({ ...live, published: true, responseCap: 3, completedResponses: 2 }, now),
    ).toBe("live");
    expect(takesResponses(live, now)).toBe(true);
  });

  it("follows status and publishing first", () => {
    expect(formAvailability({ status: "archived", paused: true }, now)).toBe("archived");
    expect(formAvailability({ status: "draft" }, now)).toBe("draft");
    expect(formAvailability({ ...live, published: false }, now)).toBe("draft");
  });

  it("is paused whatever the clock or the cap says, and live again when unpaused", () => {
    const paused = { ...live, paused: true, opensAt: "2026-10-23T00:00:00Z", full: true };
    expect(formAvailability(paused, now)).toBe("paused");
    expect(takesResponses(paused, now)).toBe(false);
    expect(formAvailability({ ...live, paused: false }, now)).toBe("live");
  });

  it("follows the opening window", () => {
    expect(formAvailability({ ...live, opensAt: "2026-10-23T00:00:00Z" }, now)).toBe("scheduled");
    expect(formAvailability({ ...live, closesAt: "2026-10-22T12:00:00Z" }, now)).toBe("closed");
    expect(formAvailability({ ...live, opensAt: "2026-10-22T12:00:00Z" }, now)).toBe("live");
  });

  it("is full at its cap, from the count or from a yes or no", () => {
    expect(formAvailability({ ...live, responseCap: 3, completedResponses: 3 }, now)).toBe("full");
    expect(formAvailability({ ...live, responseCap: 3, completedResponses: 4 }, now)).toBe("full");
    expect(formAvailability({ ...live, full: true }, now)).toBe("full");
    // A form outside its window says that first.
    expect(formAvailability({ ...live, full: true, closesAt: "2026-10-01T00:00:00Z" }, now)).toBe(
      "closed",
    );
  });
});

describe("isFull", () => {
  it("needs a cap and a count, unless told", () => {
    expect(isFull({})).toBe(false);
    expect(isFull({ responseCap: 2 })).toBe(false);
    expect(isFull({ responseCap: null, completedResponses: 10 })).toBe(false);
    expect(isFull({ responseCap: 2, completedResponses: 1 })).toBe(false);
    expect(isFull({ responseCap: 2, completedResponses: 2 })).toBe(true);
    expect(isFull({ responseCap: 2, completedResponses: 5, full: false })).toBe(false);
  });
});

describe("times that can't be trusted", () => {
  const live = { status: "active" as const, published: true };
  const at = new Date("2026-10-23T12:00:00Z");

  it("keeps a form with an unreadable opening or closing time closed", () => {
    expect(formAvailability({ ...live, opensAt: "not a time" }, at)).toBe("closed");
    expect(formAvailability({ ...live, closesAt: "2026-13-45T99:00:00Z" }, at)).toBe("closed");
  });

  it("needs Z or an offset, so the runtime's clock never decides", () => {
    expect(formAvailability({ ...live, opensAt: "2026-10-23T09:00:00" }, at)).toBe("closed");
    expect(formAvailability({ ...live, opensAt: "2026-10-23T09:00:00+00:00" }, at)).toBe("live");
    expect(formAvailability({ ...live, opensAt: "2026-10-23T14:00:00+02:00" }, at)).toBe("live");
    expect(formAvailability({ ...live, opensAt: "2026-10-23T15:00:00+02:00" }, at)).toBe("scheduled");
    expect(formAvailability({ ...live, closesAt: "2026-10-23T12:00:00.000Z" }, at)).toBe("closed");
    expect(formAvailability({ ...live, closesAt: "2026-10-23T12:00:01Z" }, at)).toBe("live");
  });

  it("reads instants with an offset only", () => {
    expect(parseInstant("2026-10-23T12:00:00Z")).toBe(Date.parse("2026-10-23T12:00:00Z"));
    expect(parseInstant("2026-10-23T12:00:00-0500")).toBe(Date.parse("2026-10-23T17:00:00Z"));
    expect(Number.isNaN(parseInstant("2026-10-23"))).toBe(true);
    expect(Number.isNaN(parseInstant("2026-10-23T12:00"))).toBe(true);
    expect(Number.isNaN(parseInstant("2026-10-23T12:00:00-05"))).toBe(true);
    expect(parseInstant("2026-10-23 12:00:00+00:00")).toBe(Date.parse("2026-10-23T12:00:00Z"));
  });
});
