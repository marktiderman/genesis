// @feat:collaboration
import { describe, expect, it } from "vitest";
import {
  canSee,
  DEFAULT_POLICY,
  describePolicy,
  gateOf,
  mayAggregate,
  normalizePolicy,
  showsNames,
  strongerRole,
  type SpacePolicy,
  type SpaceState,
  type SpaceViewer,
} from "../index";

const policy = (over: Partial<SpacePolicy> = {}): SpacePolicy => ({ ...DEFAULT_POLICY, ...over });
const state = (over: Partial<SpaceState> = {}): SpaceState => ({
  expected: 5,
  sent: 4,
  othersShared: 3,
  revealed: false,
  closed: false,
  ...over,
});
const me = (over: Partial<SpaceViewer> = {}): SpaceViewer => ({
  id: "me",
  role: "participant",
  mine: { sent: true, private: false },
  ...over,
});
const theirs = { authorId: "sam", sent: true, private: false };

describe("the gate", () => {
  it("is closed to people outside the space, and open to those who run it", () => {
    expect(gateOf(policy(), me({ role: null }), state())).toBe("none");
    expect(gateOf(policy({ visibility: "hidden" }), me({ role: "facilitator", mine: null }), state())).toBe("open");
  });

  it("asks for yours first by default", () => {
    expect(gateOf(policy(), me({ mine: null }), state())).toBe("contribute_first");
    expect(gateOf(policy(), me({ mine: { sent: false, private: false } }), state())).toBe("contribute_first");
    expect(gateOf(policy(), me(), state())).toBe("open");
    // A viewer doesn't contribute, so "after mine" doesn't hold them back.
    expect(gateOf(policy(), me({ role: "viewer", mine: null }), state())).toBe("open");
  });

  it("waits for everyone, or the deadline", () => {
    const p = policy({ reveal: "after_all" });
    expect(gateOf(p, me(), state())).toBe("waiting_for_others");
    expect(gateOf(p, me(), state({ sent: 5 }))).toBe("open");
    expect(gateOf(p, me(), state({ closed: true }))).toBe("open");
  });

  it("waits for the facilitator's reveal", () => {
    const p = policy({ reveal: "on_reveal" });
    expect(gateOf(p, me(), state())).toBe("waiting_for_reveal");
    expect(gateOf(p, me(), state({ revealed: true }))).toBe("open");
  });

  it("keeps the group's answers from someone who keeps theirs private, at Full only", () => {
    const mine = { sent: true, private: true };
    expect(gateOf(policy(), me({ mine }), state())).toBe("share_first");
    expect(gateOf(policy({ visibility: "whos_done" }), me({ mine }), state())).toBe("open");
  });

  it("needs a minimum group for totals and anonymous contents", () => {
    expect(gateOf(policy({ visibility: "totals" }), me(), state({ othersShared: 2 }))).toBe("too_few");
    expect(gateOf(policy({ anonymous: true }), me(), state({ othersShared: 2 }))).toBe("too_few");
    expect(gateOf(policy({ anonymous: true }), me(), state({ othersShared: 3 }))).toBe("open");
    // A minimum set below 3 still counts as 3: a pair can't be anonymous.
    expect(gateOf(policy({ anonymous: true, minGroup: 1 }), me(), state({ othersShared: 1 }))).toBe("too_few");
    expect(gateOf(policy({ anonymous: true, minGroup: 5 }), me(), state({ othersShared: 4 }))).toBe("too_few");
    // Named levels show no combined results, so they need no minimum.
    expect(gateOf(policy(), me(), state({ othersShared: 1 }))).toBe("open");
  });

  it("shows nothing at Hidden", () => {
    expect(gateOf(policy({ visibility: "hidden" }), me(), state())).toBe("hidden");
  });
});

describe("one contribution", () => {
  it("is always its author's", () => {
    expect(canSee(policy({ visibility: "hidden" }), me(), { ...theirs, authorId: "me", private: true, sent: false }, state())).toBe(true);
  });

  it("never shows when private or not sent, even to the facilitator", () => {
    const facilitator = me({ role: "facilitator", mine: null });
    expect(canSee(policy(), facilitator, { ...theirs, private: true }, state())).toBe(false);
    expect(canSee(policy(), facilitator, { ...theirs, sent: false }, state())).toBe(false);
    expect(canSee(policy({ visibility: "hidden" }), facilitator, theirs, state())).toBe(true);
  });

  it("shows to participants only at Full, once the gate opens", () => {
    expect(canSee(policy(), me(), theirs, state())).toBe(true);
    expect(canSee(policy(), me({ mine: null }), theirs, state())).toBe(false);
    for (const visibility of ["whos_done", "totals", "totals_with_names"] as const) {
      expect(canSee(policy({ visibility }), me(), theirs, state())).toBe(false);
    }
    expect(canSee(policy(), me({ role: null }), theirs, state())).toBe(false);
  });
});

describe("combined results and names", () => {
  it("combine at Totals and Full, behind the gate", () => {
    expect(mayAggregate(policy({ visibility: "totals" }), me(), state())).toBe(true);
    expect(mayAggregate(policy({ visibility: "totals" }), me(), state({ othersShared: 2 }))).toBe(false);
    expect(mayAggregate(policy({ visibility: "whos_done" }), me(), state())).toBe(false);
    expect(mayAggregate(policy(), me(), state({ othersShared: 1 }))).toBe(false);
    expect(canSee(policy(), me(), theirs, state({ othersShared: 1 }))).toBe(true);
    expect(mayAggregate(policy({ visibility: "hidden" }), me({ role: "owner" }), state())).toBe(true);
  });

  it("name people unless anonymous or at Totals", () => {
    expect(showsNames(policy(), me(), state())).toBe(true);
    expect(showsNames(policy({ visibility: "whos_done" }), me({ mine: null }), state())).toBe(false);
    expect(showsNames(policy({ visibility: "whos_done", reveal: "always" }), me({ mine: null }), state())).toBe(true);
    expect(showsNames(policy({ visibility: "totals" }), me(), state())).toBe(false);
    expect(showsNames(policy({ anonymous: true }), me(), state())).toBe(false);
    expect(showsNames(policy({ anonymous: true }), me({ role: "facilitator" }), state())).toBe(true);
  });
});

describe("words and settings", () => {
  it("describes a policy in one sentence", () => {
    expect(describePolicy(DEFAULT_POLICY)).toBe("Members see each other's answers once they've sent their own.");
    expect(describePolicy(policy({ visibility: "hidden" }))).toBe("Each person sees only their own work.");
    expect(describePolicy(policy({ reveal: "on_reveal", anonymous: true }))).toBe(
      "Members see each other's answers when the facilitator reveals them, without names.",
    );
  });

  it("normalizes anything unknown to the defaults, and the minimum group to at least 3", () => {
    expect(normalizePolicy()).toEqual(DEFAULT_POLICY);
    expect(normalizePolicy({ visibility: "__proto__", reveal: 3, anonymous: "yes", minGroup: 1 })).toEqual(DEFAULT_POLICY);
    expect(normalizePolicy({ visibility: "totals", minGroup: 7 })).toMatchObject({ visibility: "totals", minGroup: 7 });
  });

  it("takes the stronger role", () => {
    expect(strongerRole("viewer", "participant")).toBe("participant");
    expect(strongerRole(null, "viewer")).toBe("viewer");
    expect(strongerRole("owner", null)).toBe("owner");
  });
});
