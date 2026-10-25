import { describe, expect, it } from "vitest";
import { BlockError, defineBlock, resolveBlocks, type BlockDef } from "../blocks";
import * as entry from "../blocks-entry";
import { features, type FeatureId } from "./fixture";

function problems(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof BlockError) return error.problems;
    throw error;
  }
  return [];
}

const account = defineBlock({
  id: "account",
  platforms: ["web", "native"],
  contributes: {
    settings: [{ id: "email", section: "account", title: "Signed in as" }],
    routes: [{ path: "/sign-in" }],
    migrations: [{ package: "@acme/db", file: "migrations/0001_account.sql" }],
    privacy: { collects: [{ type: "email address", purposes: ["app functionality"], linked: true, tracking: false }] },
  },
});
const support = defineBlock({
  id: "support",
  requires: ["account"],
  contributes: {
    nav: [{ id: "help", label: "Help", path: "/help", order: 2 }],
    settings: [{ id: "contact", section: "about", title: "Contact support", order: -1 }],
    slots: { fatal: "SupportFatal" },
    skills: ["skills/support/SKILL.md"],
  },
});
const updates = defineBlock({
  id: "updates",
  platforms: ["native"],
  contributes: { settings: [{ id: "version", section: "about", title: "Version" }], nav: [{ id: "whats-new", label: "What's new", path: "/new" }] },
});

describe("defineBlock", () => {
  it("returns the block, frozen", () => {
    expect(Object.isFrozen(account)).toBe(true);
    expect(account.id).toBe("account");
  });

  it("lists every problem in one block at once", () => {
    const found = problems(() =>
      defineBlock({
        id: "Bad",
        requires: ["Bad", "Nope!"],
        platforms: ["watch" as never],
        contributes: {
          nav: [
            { id: "a", label: "A", path: "/a" },
            { id: "a", label: "A", path: "/a2" },
          ],
          menus: [] as never,
        } as never,
      }),
    );
    expect(found).toEqual([
      "Bad: a block id is a feature id: lowercase letters and digits, joined by -, _ or .",
      "Bad.requires: a block can't require itself",
      'Bad.requires: "Nope!" is not a feature id',
      'Bad.platforms: "watch" is not one of web, native, server, cli',
      "Bad.contributes.menus: not a contribution (nav, settings, routes, slots, migrations, skills, privacy)",
      'Bad.contributes.nav: "a" appears twice',
    ]);
  });

  it("checks the id against a FeatureId when given one", () => {
    const ok = defineBlock<FeatureId>({ id: "tasks" });
    expect(ok.id).toBe("tasks");
    // @ts-expect-error not a FeatureId
    expect(problems(() => defineBlock<FeatureId>({ id: "nope" }))).toEqual([]);
  });

  it("ships from the zod-free entry", () => {
    expect(entry.defineBlock).toBe(defineBlock);
    expect(entry.FEATURE_PLATFORMS).toContain("native");
  });
});

describe("resolveBlocks", () => {
  it("orders blocks after what they require and merges contributions with their FeatureId", () => {
    const r = resolveBlocks([support, updates, account]);
    expect(r.blocks.map((b) => b.id)).toEqual(["account", "support", "updates"]);
    expect(r.nav.map((n) => [n.feature, n.id])).toEqual([
      ["updates", "whats-new"],
      ["support", "help"],
    ]);
    expect(r.settings.map((s) => s.id)).toEqual(["contact", "email", "version"]);
    expect(r.slots).toEqual({ fatal: "SupportFatal" });
    expect(r.migrations).toEqual([{ package: "@acme/db", file: "migrations/0001_account.sql", feature: "account" }]);
    expect(r.skills).toEqual([{ path: "skills/support/SKILL.md", feature: "support" }]);
    expect(r.privacy.map((p) => p.feature)).toEqual(["account"]);
    expect(r.has("support")).toBe(true);
    expect(r.contributionsOf("updates")?.settings?.[0]?.id).toBe("version");
  });

  it("keeps only enabled blocks", () => {
    const r = resolveBlocks([account, support, updates], ["account", "updates"]);
    expect([...r.ids]).toEqual(["account", "updates"]);
    expect(r.contributionsOf("support")).toBeUndefined();
    expect(resolveBlocks([account, updates], (id) => id !== "updates").blocks.map((b) => b.id)).toEqual(["account"]);
  });

  it("refuses an enabled block whose requirement is off, saying which and why", () => {
    expect(problems(() => resolveBlocks([account, support], ["support"]))).toEqual([
      'support.requires: "account" is off; turn it on or turn support off',
    ]);
    const needsUpdates = defineBlock({ id: "notes", requires: ["updates"] });
    expect(problems(() => resolveBlocks([updates, needsUpdates], undefined, { platform: "web" }))).toEqual([
      'notes.requires: "updates" doesn\'t run on web; turn it on or turn notes off',
    ]);
  });

  it("needs a requirement that isn't a block to be listed in enabled, so a forgotten block is loud", () => {
    const needsBilling = defineBlock({ id: "invoices", requires: ["billing"] });
    expect(problems(() => resolveBlocks([needsBilling]))).toEqual([
      'invoices.requires: "billing" is not one of the blocks given (pass it, or list the app feature in enabled); turn it on or turn invoices off',
    ]);
    expect(resolveBlocks([needsBilling], ["invoices", "billing"]).has("invoices")).toBe(true);
    expect(problems(() => resolveBlocks([needsBilling], ["invoices"]))).toEqual([
      'invoices.requires: "billing" is not enabled; turn it on or turn invoices off',
    ]);
  });

  it("refuses a fill for a slot the host doesn't have", () => {
    const typo = defineBlock({ id: "typo", contributes: { slots: { fatl: "X", fatal: "Y" } } });
    expect(problems(() => resolveBlocks([typo], undefined, { slots: ["boot", "fatal"] }))).toEqual([
      'typo.contributes.slots: "fatl" is not a slot here (boot, fatal)',
    ]);
  });

  it("with missing: drop, leaves out a block whose requirement is off and everything needing it", () => {
    const chat = defineBlock({ id: "chat", requires: ["support"] });
    const r = resolveBlocks([chat, support, account, updates], ["chat", "support", "updates"], { missing: "drop" });
    expect(r.blocks.map((b) => b.id)).toEqual(["updates"]);
    expect(r.dropped).toEqual([
      { id: "support", missing: ["account"] },
      { id: "chat", missing: ["support"] },
    ]);
  });

  it("drops blocks for another platform", () => {
    expect(resolveBlocks([account, updates], undefined, { platform: "web" }).blocks.map((b) => b.id)).toEqual(["account"]);
  });

  it("finds cycles and duplicate ids, reusing the registry's checks", () => {
    const a = { id: "a", requires: ["b"] } as const;
    const b = { id: "b", requires: ["c"] } as const;
    const c = { id: "c", requires: ["a"] } as const;
    expect(problems(() => resolveBlocks([a, b, c]))).toEqual(["c.requires: a cycle: a → b → c → a"]);
    expect(problems(() => resolveBlocks([account, account]))).toEqual(["account: two blocks have this id"]);
  });

  it("checks ids against the registry when given one", () => {
    const tasks: BlockDef<FeatureId> = { id: "tasks", requires: ["nope"] };
    const stray = { id: "stray" };
    expect(problems(() => resolveBlocks([tasks, stray], undefined, { features }))).toEqual([
      "stray: not a feature in the registry",
      'tasks.requires: "nope" is neither a block nor a feature in the registry',
    ]);
  });

  it("refuses two blocks contributing the same nav entry, settings row, route or slot", () => {
    const clash = defineBlock({
      id: "clash",
      contributes: {
        nav: [{ id: "help", label: "Help", path: "/h" }],
        settings: [{ id: "email", section: "account", title: "Email" }],
        routes: [{ path: "/sign-in" }],
        slots: { fatal: "Other" },
      },
    });
    expect(problems(() => resolveBlocks([account, support, clash]))).toEqual([
      'clash.contributes.nav: the nav entry "help" is already contributed by support',
      'clash.contributes.settings: the settings row "email" is already contributed by account',
      'clash.contributes.routes: the route "/sign-in" is already contributed by account',
      'clash.contributes.slots: the slot "fatal" is already contributed by support',
    ]);
  });

  it("validates blocks built by hand, without defineBlock", () => {
    expect(problems(() => resolveBlocks([{ id: "x", platforms: [] }]))).toEqual([
      "x.platforms: an empty list runs nowhere; leave it out for every platform",
    ]);
  });
});
