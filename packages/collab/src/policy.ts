/**
 * What people in a shared space see of each other's work, and when: the same rules the
 * database applies (migrations/0001_genesis_collab.sql), for the interface. Pure: no I/O.
 * The tests check both give the same answer for every combination.
 */

/** What participants see of each other's contributions, least to most. */
export const VISIBILITY_LEVELS = ["hidden", "whos_done", "totals", "totals_with_names", "full"] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

/** When they see it. */
export const REVEAL_RULES = ["always", "after_me", "after_all", "on_reveal"] as const;
export type Reveal = (typeof REVEAL_RULES)[number];

/** Who may do what in a space, most to least. */
export const SPACE_ROLES = ["owner", "facilitator", "participant", "viewer"] as const;
export type SpaceRole = (typeof SPACE_ROLES)[number];

/** Combined results never show for fewer contributors than this, besides the viewer. */
export const MIN_GROUP = 3;

export interface SpacePolicy {
  visibility: Visibility;
  reveal: Reveal;
  /** Contents show without names (the facilitator still sees them). */
  anonymous: boolean;
  /** At least MIN_GROUP. */
  minGroup: number;
}

export const DEFAULT_POLICY: SpacePolicy = {
  visibility: "full",
  reveal: "after_me",
  anonymous: false,
  minGroup: MIN_GROUP,
};

/** Where the space stands for one period. */
export interface SpaceState {
  /** People expected to contribute (the participants). */
  expected: number;
  /** Of those, how many have sent one. */
  sent: number;
  /** Others (not the viewer) with a sent contribution that isn't private. */
  othersShared: number;
  revealed: boolean;
  /** The window has closed (a deadline counts as "everyone"). */
  closed: boolean;
}

/** The person looking, and where their own contribution stands. */
export interface SpaceViewer {
  id: string;
  /** Null: not in the space. */
  role: SpaceRole | null;
  /** Null: they haven't started one this period. */
  mine: { sent: boolean; private: boolean } | null;
}

export interface ContributionFacts {
  authorId: string;
  sent: boolean;
  private: boolean;
}

/**
 * What to show in place of the others' work:
 * - `none`: not in the space;
 * - `hidden`: the space shows nothing of each other;
 * - `contribute_first`: send yours to see the group's;
 * - `waiting_for_others`: it opens when everyone's in, or at the deadline;
 * - `waiting_for_reveal`: the facilitator hasn't revealed it yet;
 * - `share_first`: yours is private, so the group's answers stay closed to you;
 * - `too_few`: not enough others have shared for combined or anonymous results;
 * - `open`.
 */
export type SpaceGate =
  | "none"
  | "hidden"
  | "contribute_first"
  | "waiting_for_others"
  | "waiting_for_reveal"
  | "share_first"
  | "too_few"
  | "open";

const RANK: Record<SpaceRole, number> = { owner: 4, facilitator: 3, participant: 2, viewer: 1 };

/** Owners and facilitators run the space: they see every contribution that isn't private. */
export function runsSpace(role: SpaceRole | null): boolean {
  return role != null && RANK[role] >= RANK.facilitator;
}

/** The stronger of two roles (a person in a space directly and through a group). */
export function strongerRole(a: SpaceRole | null, b: SpaceRole | null): SpaceRole | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** Combined results or anonymous contents, which need a minimum group. */
function needsGroup(policy: SpacePolicy): boolean {
  return policy.visibility === "totals" || policy.anonymous;
}

export function gateOf(policy: SpacePolicy, viewer: SpaceViewer, state: SpaceState): SpaceGate {
  if (!viewer.role) return "none";
  if (runsSpace(viewer.role)) return "open";
  if (policy.visibility === "hidden") return "hidden";
  const participant = viewer.role === "participant";
  if (policy.reveal === "after_me" && participant && !viewer.mine?.sent) return "contribute_first";
  if (policy.reveal === "after_all" && state.sent < state.expected && !state.closed) {
    return "waiting_for_others";
  }
  if (policy.reveal === "on_reveal" && !state.revealed) return "waiting_for_reveal";
  if (policy.visibility === "full" && participant && viewer.mine?.sent && viewer.mine.private) {
    return "share_first";
  }
  if (needsGroup(policy) && state.othersShared < Math.max(policy.minGroup, MIN_GROUP)) return "too_few";
  return "open";
}

/** Whether the viewer may read one contribution's contents. */
export function canSee(
  policy: SpacePolicy,
  viewer: SpaceViewer,
  contribution: ContributionFacts,
  state: SpaceState,
): boolean {
  if (contribution.authorId === viewer.id) return true;
  if (!viewer.role || contribution.private || !contribution.sent) return false;
  if (runsSpace(viewer.role)) return true;
  return policy.visibility === "full" && gateOf(policy, viewer, state) === "open";
}

/**
 * Whether the viewer may see combined results (counts, averages, spread) of others' work.
 * These need the minimum group at every level, Full included: an average of two is the other
 * person's answer. Full still shows the contributions themselves below it.
 */
export function mayAggregate(policy: SpacePolicy, viewer: SpaceViewer, state: SpaceState): boolean {
  if (runsSpace(viewer.role)) return true;
  return (
    (policy.visibility === "totals" || policy.visibility === "full") &&
    gateOf(policy, viewer, state) === "open" &&
    state.othersShared >= Math.max(policy.minGroup, MIN_GROUP)
  );
}

/** Whether the viewer sees who contributed (names on contents, the who's-done list). */
export function showsNames(policy: SpacePolicy, viewer: SpaceViewer, state: SpaceState): boolean {
  if (runsSpace(viewer.role)) return true;
  if (policy.anonymous) return false;
  return (
    (policy.visibility === "whos_done" ||
      policy.visibility === "totals_with_names" ||
      policy.visibility === "full") &&
    gateOf(policy, viewer, state) === "open"
  );
}

const WHAT: Record<Exclude<Visibility, "hidden">, string> = {
  whos_done: "who has answered, but not what they said",
  totals: "how many have answered and the combined results, without names",
  totals_with_names: "how many times each person has answered",
  full: "each other's answers",
};

const WHEN: Record<Reveal, string> = {
  always: "at any time, even before they answer",
  after_me: "once they've sent their own",
  after_all: "once everyone is in, or at the deadline",
  on_reveal: "when the facilitator reveals them",
};

/** One sentence anyone can read: "Members see each other's answers once they've sent their own." */
export function describePolicy(policy: SpacePolicy): string {
  if (policy.visibility === "hidden") return "Each person sees only their own work.";
  const names = policy.anonymous && policy.visibility !== "totals" ? ", without names" : "";
  return `Members see ${WHAT[policy.visibility]} ${WHEN[policy.reveal]}${names}.`;
}

/** A policy with every field present and in range; anything unknown takes the default. */
export function normalizePolicy(input: Partial<Record<keyof SpacePolicy, unknown>> = {}): SpacePolicy {
  const visibility = (VISIBILITY_LEVELS as readonly unknown[]).includes(input.visibility)
    ? (input.visibility as Visibility)
    : DEFAULT_POLICY.visibility;
  const reveal = (REVEAL_RULES as readonly unknown[]).includes(input.reveal)
    ? (input.reveal as Reveal)
    : DEFAULT_POLICY.reveal;
  const min = typeof input.minGroup === "number" && Number.isInteger(input.minGroup) ? input.minGroup : MIN_GROUP;
  return {
    visibility,
    reveal,
    anonymous: input.anonymous === true,
    minGroup: Math.min(Math.max(min, MIN_GROUP), 1000),
  };
}
