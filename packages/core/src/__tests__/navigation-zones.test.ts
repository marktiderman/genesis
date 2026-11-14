/**
 * @feat:navigation-zones
 * Zones over the navigation tree (ADR 0003 §1 and §4): the current zone, each zone's pages, the global pages
 * and the roll-up.
 */
import { describe, expect, it } from "vitest";
import { resolveNavigation, resolveNavigationZones, type NavigationNode, type NavigationZone } from "../navigation";

const tree: NavigationNode<string> = {
  id: "root",
  path: "/",
  label: "Home",
  items: [],
  children: [
    { id: "today", path: "/today", label: "Today", items: [] },
    {
      id: "train",
      path: "/train",
      label: "Training",
      items: [],
      zone: "training",
      children: [{ id: "workout", path: "/train/$workoutId", label: "Workout", items: [] }],
    },
    { id: "classes", path: "/classes", label: "Classes", items: [], zone: "training" },
    {
      id: "admin",
      path: "/admin",
      label: "Admin",
      items: [],
      zone: "admin",
      // Opened from the admin list, living under another path: its logical parent keeps the zone.
      children: [{ id: "lesson", path: "/lessons/$id", label: "Lesson", items: [] }],
    },
    { id: "settings", path: "/settings", label: "Settings", items: [] },
    { id: "stale", path: "/stale", label: "Stale", items: [], zone: "gone" },
  ],
};

const ZONES: NavigationZone<string>[] = [
  { id: "admin", label: "Admin", icon: "shield" },
  { id: "training", label: "Training" },
  { id: "empty", label: "Empty" },
];

describe("resolveNavigation's zone", () => {
  it("is the nearest zone in the trail, and none on a global page", () => {
    expect(resolveNavigation(tree, "/train/w1").zone).toBe("training");
    expect(resolveNavigation(tree, "/lessons/l1").zone).toBe("admin");
    expect(resolveNavigation(tree, "/settings").zone).toBeUndefined();
    expect("zone" in resolveNavigation(tree, "/settings")).toBe(false);
  });
});

describe("resolveNavigationZones", () => {
  it("groups the tree by zone, in the zones' order, leaving out zones with no page", () => {
    const result = resolveNavigationZones(tree, "/classes", { zones: ZONES, rollUp: "today" });
    expect(result.zone).toEqual({ id: "training", label: "Training" });
    expect(result.zones.map((z) => [z.zone.id, z.nodes.map((n) => n.id)])).toEqual([
      ["admin", ["admin"]],
      ["training", ["train", "classes"]],
    ]);
    expect(result.rollUp?.id).toBe("today");
    // An unknown zone id reads as global.
    expect(result.global.map((n) => n.id)).toEqual(["settings", "stale"]);
    expect(result.navigation.current.id).toBe("classes");
  });

  it("has no zone on the roll-up or a global page, and works with no zones at all", () => {
    expect(resolveNavigationZones(tree, "/today", { zones: ZONES, rollUp: "today" }).zone).toBeUndefined();
    const none = resolveNavigationZones(tree, "/train");
    expect(none.zone).toBeUndefined();
    expect(none.zones).toEqual([]);
    expect(none.global).toHaveLength(6);
  });
});
